"use strict";

import escapeStringRegexp from "escape-string-regexp";
import fs from "fs-extra";
import path from "path";

const INVALID_ARGS_ERROR =
  "[rollup-plugin-generate-html-template] You did not provide a template or target!";

/**
 * Takes an HTML file as a template then adds the bundle to the final file.
 * @param {Object} options The options object.
 * @return {Object} The rollup code object.
 */
export default function htmlTemplate(options = {}) {
  const { template, target, prefix, attrs, replaceVars } = options;
  const scriptTagAttributes = attrs && attrs.length > 0 ? attrs : [];
  return {
    name: "html-template",
    /*
      This plugin used to hook into generateBundle but the trouble with that (for the embedContent=true option) is that the code (below) to read the 
      bundle file would run before the file was actually written so you'd get a 'file not found' exception PLUS if the
      file did exist e.g. it had been generated previously, then there was a danger that you'd embed out-of-date code...
      ...which is a different kind of bad.
      I haven't gone through the rest of the code with a fine-tooth comb but it seems to work for my current purpose, however YMMV.
    */
    async writeBundle(outputOptions, bundleInfo) {
      const bundleKeys = Object.keys(bundleInfo);
      return new Promise(async (resolve, reject) => {
        try {
          if (!target && !template) throw new Error(INVALID_ARGS_ERROR);

          const outputDir =
            outputOptions.dir || path.dirname(outputOptions.file);

          let targetDir = outputDir;
          let bundleDirString = "";

          if (target && path.dirname(target) !== ".") {
            targetDir = path.dirname(target);
            const bundleDir = path.relative(targetDir, outputDir);
            bundleDirString = bundleDir && `${bundleDir}/`;
          }

          // Get the target file name.
          const targetName = path.basename(target || template);

          // Add the file suffix if it isn't there.
          const targetFile =
            targetName.indexOf(".html") < 0 ? `${targetName}.html` : targetName;

          // Read the file
          const buffer = await fs.readFile(template);

          // Convert buffer to a string and get the </body> index
          let tmpl = buffer.toString("utf8");
          if (replaceVars) {
            const replacePairs = Object.entries(replaceVars);
            replacePairs.forEach(([pattern, replacement]) => {
              const escapedPattern = escapeStringRegexp(pattern);
              const regex = new RegExp(`${escapedPattern}`, "g");
              tmpl = tmpl.replace(regex, replacement);
            });
          }

          let injected = tmpl;

          // Inject the style tags before the head close tag
          const headCloseTag = injected.lastIndexOf("</head>");

          // Inject the script tags before the body close tag
          injected = [
            injected.slice(0, headCloseTag),
            ...bundleKeys
              .filter(f => path.extname(f) === ".css")
              .map(
                b =>
                  `<link rel="stylesheet" type="text/css" href="${prefix ||
                    ""}${b}">\n`
              ),
            injected.slice(headCloseTag, injected.length),
          ].join("");

          const bodyCloseTag = injected.lastIndexOf("</body>");

          // Inject the script tags before the body close tag

          const mapSrc = bundleKeys
            .filter(f => path.extname(f) === ".js")
            .map(b => ({
              path: b,
              src: `<script ${scriptTagAttributes.join(
                " "
              )} src="${bundleDirString}${prefix || ""}${b}"></script>\n`,
            }));

          if (options.embedContent) {
            const loadjssrc = mapSrc.map(
              async b =>
                await fs.readFile(
                  `${outputDir}${path.sep}${prefix || ""}${b.path}`
                )
            );
            const asyncRes = await Promise.all(loadjssrc);
            mapSrc.forEach((b, i) => {
              const src = asyncRes[i].toString("utf-8");
              b.src = `<script${
                scriptTagAttributes.length > 0
                  ? "" + scriptTagAttributes.join(" ")
                  : ""
              }>${src.trim()}</script>\n`;
            });
          }

          injected = [
            injected.slice(0, bodyCloseTag),
            ...mapSrc.map(b => b.src),
            injected.slice(bodyCloseTag, injected.length),
          ].join("");

          // write the injected template to a file
          const finalTarget = path.join(targetDir, targetFile);
          await fs.ensureFile(finalTarget);
          await fs.writeFile(finalTarget, injected);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },
  };
}

function getEntryPoints(bundleInfo = {}) {
  const bundles = Object.keys(bundleInfo);
  return bundles.reduce((entryPoints, bundle) => {
    if (bundleInfo[bundle].isEntry === true) {
      entryPoints.push(bundle);
    }
    return entryPoints;
  }, []);
}

// Expose getEntryPoints for testing
htmlTemplate.getEntryPoints = getEntryPoints;
htmlTemplate.INVALID_ARGS_ERROR = INVALID_ARGS_ERROR;
