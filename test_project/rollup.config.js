import html from "../dist/rollup-plugin-generate-html-template.module";

export default {
  input: "src/index.js",
  output: {
    dir: "dist",
    format: "umd",
  },
  plugins: [
    html({
      template: "src/main.html",
      target: "dist/index.html",
      embedContent: true,
    }),
  ],
};
