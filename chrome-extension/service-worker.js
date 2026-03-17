/**
 * service-worker.js — Background Service Worker (Manifest V3)
 *
 * 监听扩展生命周期事件：
 * - 首次安装：打开网站首页（UTM 追踪装机来源）
 * - 首次安装：设置卸载重定向（UTM 追踪流失来源）
 * - 更新：静默处理，不打扰用户
 */

const WEBSITE_BASE = 'https://emojisymbolscopy.com';

/**
 * 扩展安装/更新事件处理
 * @param {object} details
 * @param {string} details.reason - 'install' | 'update' | 'chrome_update'
 * @param {string} [details.previousVersion] - 上一版本号（仅 update 时存在）
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装：在新标签页打开网站（带 UTM 追踪装机来源）
    chrome.tabs.create({
      url: `${WEBSITE_BASE}/chrome-extension/welcome?utm_source=extension&utm_medium=install&utm_campaign=onboarding`,
      active: true
    });

    // 设置卸载重定向（用户卸载后自动打开，收集流失反馈）
    // 卸载反馈页：收集用户流失原因
    chrome.runtime.setUninstallURL(
      `${WEBSITE_BASE}/chrome-extension/feedback?utm_source=extension&utm_medium=uninstall&utm_campaign=churn`
    );
  }
  // update / chrome_update：不打开新标签页，避免骚扰用户
});
