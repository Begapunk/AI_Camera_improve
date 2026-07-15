/**
 * fileBase64 - 向后兼容的 base64 读取工具
 *
 * 已迁移到 imageManager.pathToBase64()，本文件保留作为过渡。
 * 所有新代码请直接使用 imageManager。
 */

import { pathToBase64 } from './imageManager.js';

export const readFileAsBase64 = pathToBase64;

export default { readFileAsBase64 };