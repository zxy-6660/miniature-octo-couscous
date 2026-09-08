// 为 mammoth 浏览器构建提供与主模块一致的类型定义
declare module "mammoth/mammoth.browser" {
  import mammoth = require("mammoth");
  export = mammoth;
}