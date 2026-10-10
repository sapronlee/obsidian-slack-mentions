/* Slack Mentions
   Renders [@Name](slack://user?team=T…&id=U…) links as avatar chips: click to open Slack, hover for a profile card,
   type @ to insert one.
   - Directory: people.json in the plugin folder, synced from the Slack API or maintained by hand in settings.
   - Token: stored in Obsidian's keychain under a fixed ID (Settings → Keychain). data.json never contains it. */
const {
  Plugin,
  PluginSettingTab,
  Setting,
  EditorSuggest,
  FuzzySuggestModal,
  Notice,
  requestUrl,
  setIcon,
  getLanguage,
  editorLivePreviewField,
} = require("obsidian");
const { ViewPlugin, Decoration, WidgetType } = require("@codemirror/view");
const { RangeSetBuilder, Prec, StateEffect } = require("@codemirror/state");

const LINK_RE = /\[@?([^\]\n]+)\]\(slack:\/\/user\?team=([A-Z0-9]+)&id=([A-Z0-9]+)\)/g;
const URL_RE = /^slack:\/\/user\?team=([A-Z0-9]+)&id=([A-Z0-9]+)/;
const TRIGGER_RE = /(?:^|[\s（(，,。：:、；;“"「])@([^\s@\[\]()]{0,24})$/;
const NEEDED_SCOPES = ["users:read", "users:read.email"];
const DAY = 24 * 3600 * 1000;
const STATUS_TTL = 5 * 60 * 1000;
const SECRET_ID = "slack-mentions";
const HELP_URL = {
  en: "https://github.com/sapronlee/obsidian-slack-mentions#1-create-a-slack-token",
  zh: "https://github.com/sapronlee/obsidian-slack-mentions/blob/main/README.zh-CN.md#1-创建-slack-token",
};
const LIST_LIMIT = 50;

const DEFAULT_SETTINGS = {
  autoSync: true,
  showAvatar: true,
  clickAction: "slack",
  hoverDelay: 350,
};

/* ---------- i18n: Simplified Chinese when Obsidian is set to it, English otherwise ---------- */
const I18N = {
  en: {
    cmdInsert: "Insert person",
    cmdReload: "Reload directory",
    cmdSync: "Sync directory from Slack",
    reloaded: (n) => `Directory loaded: ${n} people`,
    never: "never",
    slackErrors: {
      invalid_auth: "Invalid token",
      not_authed: "No token provided",
      account_inactive: "The token's account is deactivated",
      token_revoked: "The token has been revoked",
      token_expired: "The token has expired",
      missing_scope: "The token is missing a scope",
      users_not_found: "No Slack user has this email",
      ratelimited: "Rate limited by Slack",
    },
    slackError: (code) => `Slack error: ${code}`,
    withCode: (msg, code) => `${msg} (${code})`,
    errNoEncryption: "Keychain encryption is unavailable, so the Slack connection is disabled",
    errNoToken: "No Slack token saved in settings yet",
    errCannotSave: "Keychain encryption is unavailable, so the token can't be saved",
    tokenUser: "user token (xoxp)",
    tokenBot: "bot token (xoxb)",
    tokenOther: "other token type",
    syncing: "Syncing directory from Slack…",
    syncingN: (n) => `Syncing directory from Slack… ${n} people so far`,
    syncDone: (active, deleted) => `Sync complete: ${active} active, ${deleted} deactivated`,
    syncExtra: (n) => ` (plus ${n} from other workspaces)`,
    syncFailed: (msg) => `Sync failed: ${msg}`,
    notInDirectory: "Not in the directory",
    deactivated: "Deactivated",
    localTime: (t) => `Local time ${t}`,
    status: (s) => `Status: ${s}`,
    sendMessage: "Message in Slack",
    mentionedIn: (n) => `Mentioned in (${n})`,
    moreNotes: (n) => `${n} more`,
    modalPlaceholder: "Search by name, username, email or alias",
    listSep: ", ",
    // settings
    hConnection: "Slack connection",
    tokenName: "Slack token",
    tokenDesc: "Encrypted in Obsidian's keychain (Settings → Keychain), never written to your notes or the plugin's config files. Only the read-only scopes users:read and users:read.email are needed. ",
    howToCreate: "How to create a token",
    tokenSaved: "Saved",
    replace: "Replace",
    tokenRemoveHint: (id) => `To remove the token, delete “${id}” in Settings → Keychain.`,
    tokenPlaceholder: "Paste a token starting with xoxp- or xoxb-",
    save: "Save",
    cancel: "Cancel",
    notAToken: "That doesn't look like a Slack token: it should start with xoxp- or xoxb-",
    tokenStored: "Token saved to the keychain. Try “Test connection”.",
    noEncryption: "Keychain encryption is unavailable. Obsidian would store secrets in plain text, so token settings are disabled.",
    needToken: "Save a Slack token above first.",
    testName: "Test connection",
    testDesc: "Check that the token works and list the scopes it actually has.",
    testBtn: "Test connection",
    testing: "Testing…",
    rowWorkspace: "Workspace",
    rowIdentity: "Identity",
    rowScopes: "Scopes",
    rowMissing: "Missing",
    rowWarning: "Warning",
    rowResult: "Result",
    workspaceEnterprise: (team, id) => `${team} (Enterprise Grid ${id})`,
    workspacePlain: (team, id) => `${team} (${id})`,
    noScopes: "(Slack returned no scope list)",
    missingScopes: (list) => `${list}. Directory sync and email lookup will fail.`,
    extraScopes: (list) =>
      `More scopes than needed: ${list}. The plugin doesn't use them, and they raise the stakes if the token leaks. Consider a token with only users:read and users:read.email.`,
    scopesOk: "Scopes are exactly right",
    connFailed: (msg) => `Connection failed: ${msg}`,
    hSync: "Directory sync",
    autoSyncName: "Sync daily",
    autoSyncDesc: "When Obsidian starts, sync if the last sync was more than 24 hours ago.",
    syncNowName: "Sync now",
    syncSummary: (time, active, deleted) => `Last sync: ${time}. Directory: ${active} people${deleted ? ` (plus ${deleted} deactivated)` : ""}.`,
    lastSyncFailed: (msg) => `Last sync failed: ${msg}`,
    syncNowBtn: "Sync now",
    syncingBtn: "Syncing…",
    fetchedN: (n) => `${n} fetched…`,
    syncHint: "Bots are skipped. Deactivated people stay in the directory so old mentions still show their names, but they don't appear in @ suggestions. On Enterprise Grid, the workspace list only covers the token's workspace; people mentioned in your notes or added by email are looked up individually on each sync.",
    hDirectory: "Directory",
    addByEmailName: "Add by email",
    addByEmailDesc: "The email must match the one registered in Slack exactly.",
    addBtn: "Find and add",
    added: (name) => `Added ${name}`,
    addFailed: (msg) => `Couldn't add: ${msg}`,
    searchName: "Search",
    searchDesc: "Filter by name, username, email or alias. Aliases (nicknames, romanized names…) also match in @ suggestions; separate several with commas.",
    searchPeople: "Search people",
    hDisplay: "Display",
    showAvatarName: "Show avatars",
    showAvatarDesc: "Show the Slack photo when there is one, otherwise the initial. When off, mentions show only the name.",
    clickName: "When clicking a mention",
    clickDesc: "With “Show profile card”, open Slack from the button on the card.",
    clickSlack: "Open Slack (card on hover)",
    clickCard: "Show profile card (no hover)",
    hoverName: "Profile card hover delay",
    hoverDesc: "Only applies to “Open Slack” mode.",
    seconds: (s) => `${s} s`,
    hCheck: "Maintenance",
    checkName: "Check mentions in notes",
    checkDesc: "Find mentions of deactivated people or people missing from the directory.",
    checkBtn: "Check",
    checkOk: (n) => `All good: ${n} people are mentioned in your notes, all in the directory and active.`,
    emptyNoMatch: "No matches",
    emptyDirectory: "The directory is empty. Save a token and sync, or add people by email.",
    badgeDeleted: "Deactivated",
    badgeManual: "Added manually",
    badgeOtherWorkspace: "Other workspace",
    notesCount: (n) => (n === 1 ? "1 note" : `${n} notes`),
    aliasPlaceholder: "Aliases",
    removeFromDirectory: "Remove from directory",
    showingFirst: (total, limit) => `${total} people; showing the first ${limit}. Search to narrow it down.`,
  },
  zh: {
    cmdInsert: "插入人员",
    cmdReload: "重新加载人员库",
    cmdSync: "从 Slack 同步通讯录",
    reloaded: (n) => `人员库已加载：${n} 人`,
    never: "从未",
    slackErrors: {
      invalid_auth: "token 无效",
      not_authed: "没有提供 token",
      account_inactive: "token 对应的账号已停用",
      token_revoked: "token 已被吊销",
      token_expired: "token 已过期",
      missing_scope: "token 缺少权限",
      users_not_found: "Slack 里找不到这个邮箱",
      ratelimited: "请求太频繁，被 Slack 限流",
    },
    slackError: (code) => `Slack 返回错误：${code}`,
    withCode: (msg, code) => `${msg}（${code}）`,
    errNoEncryption: "系统钥匙串加密不可用，已停用 Slack 连接",
    errNoToken: "还没有在设置里保存 Slack token",
    errCannotSave: "系统钥匙串加密不可用，不能保存 token",
    tokenUser: "用户 token（xoxp）",
    tokenBot: "机器人 token（xoxb）",
    tokenOther: "其他类型",
    syncing: "正在从 Slack 同步通讯录…",
    syncingN: (n) => `正在从 Slack 同步通讯录…已获取 ${n} 人`,
    syncDone: (active, deleted) => `同步完成：${active} 人在职，${deleted} 人已停用`,
    syncExtra: (n) => `（另补充其他工作区 ${n} 人）`,
    syncFailed: (msg) => `同步失败：${msg}`,
    notInDirectory: "不在人员库里",
    deactivated: "账号已停用",
    localTime: (t) => `当地时间 ${t}`,
    status: (s) => `状态：${s}`,
    sendMessage: "在 Slack 中发消息",
    mentionedIn: (n) => `提到的笔记（${n}）`,
    moreNotes: (n) => `还有 ${n} 篇`,
    modalPlaceholder: "搜索人员：名字、用户名、邮箱或别名",
    listSep: "、",
    hConnection: "Slack 连接",
    tokenName: "Slack token",
    tokenDesc: "加密保存在 Obsidian 的钥匙串（设置 → 钥匙串）里，不会写进笔记或插件配置文件。只需要 users:read 和 users:read.email 两个只读权限。",
    howToCreate: "如何创建 token",
    tokenSaved: "已保存",
    replace: "更换",
    tokenRemoveHint: (id) => `要删除 token，到「设置 → 钥匙串」删除「${id}」。`,
    tokenPlaceholder: "粘贴 xoxp- 或 xoxb- 开头的 token",
    save: "保存",
    cancel: "取消",
    notAToken: "看起来不是 Slack token：应以 xoxp- 或 xoxb- 开头",
    tokenStored: "token 已存入钥匙串，可以点「测试连接」",
    noEncryption: "系统钥匙串加密不可用：Obsidian 此时会把密钥明文保存，所以这里禁用了 token 设置。",
    needToken: "需要先在上方保存 Slack token。",
    testName: "测试连接",
    testDesc: "检查 token 是否有效，并列出它实际拥有的权限。",
    testBtn: "测试连接",
    testing: "测试中…",
    rowWorkspace: "工作区",
    rowIdentity: "身份",
    rowScopes: "权限",
    rowMissing: "缺少",
    rowWarning: "提醒",
    rowResult: "结果",
    workspaceEnterprise: (team, id) => `${team}（企业版 ${id}）`,
    workspacePlain: (team, id) => `${team}（${id}）`,
    noScopes: "（Slack 没有返回权限列表）",
    missingScopes: (list) => `${list}，同步通讯录 / 按邮箱查人会失败`,
    extraScopes: (list) => `权限超出需要：${list}。插件用不到这些，token 一旦泄露风险更大，建议换成只有 users:read、users:read.email 的 token`,
    scopesOk: "权限正好，可以使用",
    connFailed: (msg) => `连接失败：${msg}`,
    hSync: "通讯录同步",
    autoSyncName: "每天自动同步",
    autoSyncDesc: "打开 Obsidian 时，距离上次同步超过 24 小时就自动同步一次。",
    syncNowName: "立即同步",
    syncSummary: (time, active, deleted) => `上次同步：${time}　人员库：${active} 人${deleted ? `（另有 ${deleted} 人已停用）` : ""}`,
    lastSyncFailed: (msg) => `上次同步失败：${msg}`,
    syncNowBtn: "立即同步",
    syncingBtn: "同步中…",
    fetchedN: (n) => `已获取 ${n} 人…`,
    syncHint: "自动排除机器人；已停用的账号保留在库里但不出现在 @ 补全中，笔记里的旧链接仍能显示名字。企业版（Enterprise Grid）的通讯录只包含 token 所在工作区的人；笔记里提到的、按邮箱添加的人，每次同步时会单独补查。",
    hDirectory: "人员库",
    addByEmailName: "按邮箱添加",
    addByEmailDesc: "邮箱必须和 Slack 上登记的完全一致。",
    addBtn: "查找并添加",
    added: (name) => `已添加：${name}`,
    addFailed: (msg) => `添加失败：${msg}`,
    searchName: "搜索",
    searchDesc: "按名字、用户名、邮箱或别名筛选。别名（花名、拼音等）在 @ 补全时也能搜到，多个用逗号分隔。",
    searchPeople: "搜索人员",
    hDisplay: "显示与交互",
    showAvatarName: "显示头像",
    showAvatarDesc: "有 Slack 头像时显示照片，没有时显示首字。关闭后提及只显示名字。",
    clickName: "点击提及时",
    clickDesc: "选「弹出资料卡」时，在资料卡里点按钮再打开 Slack。",
    clickSlack: "直接打开 Slack（悬停弹出资料卡）",
    clickCard: "弹出资料卡（不随悬停弹出）",
    hoverName: "悬停多久弹出资料卡",
    hoverDesc: "只在「直接打开 Slack」模式下生效。",
    seconds: (s) => `${s} 秒`,
    hCheck: "检查",
    checkName: "检查笔记里的人员链接",
    checkDesc: "找出指向已停用账号、或人员库里没有的人的链接。",
    checkBtn: "开始检查",
    checkOk: (n) => `没有问题：笔记里提到了 ${n} 个人，都在人员库里且账号正常。`,
    emptyNoMatch: "没有匹配的人",
    emptyDirectory: "人员库还是空的：保存 token 后同步通讯录，或按邮箱添加。",
    badgeDeleted: "已停用",
    badgeManual: "手动添加",
    badgeOtherWorkspace: "其他工作区",
    notesCount: (n) => `${n} 篇笔记`,
    aliasPlaceholder: "别名",
    removeFromDirectory: "从人员库删除",
    showingFirst: (total, limit) => `共 ${total} 人，只显示前 ${limit} 个，用搜索缩小范围。`,
  },
};
const LANG = (() => {
  try {
    return getLanguage() === "zh" ? "zh" : "en";
  } catch (e) {
    return "en";
  }
})();
const T = I18N[LANG];

// Refresh effect: forces the editor to rebuild chips after a settings change
const refreshEffect = StateEffect.define();

// Avatar background: FNV-1a hash of the Slack ID → hue, fixed saturation/lightness so white text stays readable
const colorOf = (id) => {
  let h = 0x811c9dc5;
  for (const c of id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `hsl(${h % 360} 55% 45%)`;
};
const initialOf = (name) => ((name || "").trim()[0] || "?").toUpperCase();
const slackUrl = (team, id) => `slack://user?team=${team}&id=${id}`;
// window.open doesn't hand custom protocols to the OS in Obsidian; go through Electron's shell
const openSlack = (href) => require("electron").shell.openExternal(href);
const parseUrl = (href) => {
  const m = (href || "").match(URL_RE);
  return m ? { team: m[1], id: m[2] } : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (ts) => (ts ? window.moment(ts).format("YYYY-MM-DD HH:mm") : T.never);
const byName = (a, b) => a.name.localeCompare(b.name, LANG === "zh" ? "zh" : undefined);

// Avatar: photo when available (falls back to the initial if it fails to load)
const renderAvatar = (parent, p, id, name, cls, showPhoto) => {
  const av = parent.createSpan({ cls: cls ? `sp-avatar ${cls}` : "sp-avatar", text: initialOf(name) });
  av.style.setProperty("--sp-color", colorOf(id));
  if (showPhoto && p && p.avatar) {
    const img = av.createEl("img", { attr: { src: p.avatar, alt: "", referrerpolicy: "no-referrer" } });
    img.addEventListener("load", () => av.addClass("has-photo"));
    img.addEventListener("error", () => img.remove());
  }
  return av;
};

// Slack member → directory entry. Display names like "Wei Zhang (张伟)" are split into name + secondary name.
const toPerson = (m) => {
  const pr = m.profile || {};
  const disp = (pr.display_name || pr.real_name || m.real_name || m.name || "").trim();
  const mm = disp.match(/^(.+?)\s*[（(]([^)）]+)[)）]$/);
  return {
    id: m.id,
    // Enterprise Grid user objects may omit team_id; fall back to one of the user's workspaces
    team: m.team_id || (m.enterprise_user && m.enterprise_user.teams && m.enterprise_user.teams[0]) || "",
    name: mm ? mm[1] : disp,
    en: mm ? mm[2] : "",
    username: m.name || "",
    email: pr.email || "",
    title: pr.title || "",
    tz: m.tz || "",
    avatar: pr.image_72 || "",
    deleted: !!m.deleted,
  };
};

class SlackError extends Error {
  constructor(code, needed) {
    super(T.slackErrors[code] ? T.withCode(T.slackErrors[code], code) : T.slackError(code));
    this.code = code;
    this.needed = needed;
  }
}

module.exports = class SlackMentionsPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.store = { team: "", syncedAt: 0, people: [] };
    this.people = new Map();
    this.mentions = new Map();
    this.statusCache = new Map();
    this.renderVersion = 0;
    await this.migrateSecretName();
    await this.loadPeople();

    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll('a.external-link[href^="slack://user"]').forEach((a) => this.decorateAnchor(a));
    });
    this.registerEditorExtension(Prec.highest(this.livePreviewExtension()));
    this.registerEditorSuggest(new PeopleSuggest(this));
    this.addSettingTab(new SlackMentionsSettingTab(this));

    this.addCommand({ id: "insert", name: T.cmdInsert, editorCallback: (editor) => new PeopleModal(this, editor).open() });
    this.addCommand({
      id: "reload",
      name: T.cmdReload,
      callback: async () => {
        await this.loadPeople();
        new Notice(T.reloaded(this.people.size));
      },
    });
    this.addCommand({ id: "sync", name: T.cmdSync, callback: () => this.syncDirectory({ notify: true }).catch(() => {}) });

    this.app.workspace.onLayoutReady(() => {
      this.indexMentions();
      this.maybeAutoSync();
    });
    this.registerInterval(window.setInterval(() => this.maybeAutoSync(), 3600 * 1000));
    this.registerEvent(this.app.vault.on("modify", (f) => this.indexFile(f)));
    this.registerEvent(this.app.vault.on("create", (f) => this.indexFile(f)));
    this.registerEvent(this.app.vault.on("delete", (f) => this.dropFile(f.path)));
    this.registerEvent(
      this.app.vault.on("rename", (f, old) => {
        this.dropFile(old);
        this.indexFile(f);
      })
    );
    this.register(() => this.hideCard());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* ---------- Directory storage ---------- */
  get peoplePath() {
    return `${this.manifest.dir}/people.json`;
  }
  async loadPeople() {
    try {
      const data = JSON.parse(await this.app.vault.adapter.read(this.peoplePath));
      this.store = { team: data.team || "", syncedAt: data.syncedAt || 0, people: data.people || [], lastError: data.lastError || "" };
    } catch (e) {
      if (await this.app.vault.adapter.exists(this.peoplePath)) console.error("Slack Mentions: failed to read people.json", e);
      this.store = { team: "", syncedAt: 0, people: [] };
    }
    this.team = this.store.team;
    this.people = new Map(this.store.people.map((p) => [p.id, p]));
  }
  async savePeople() {
    this.store.people = [...this.people.values()];
    this.store.team = this.team;
    await this.app.vault.adapter.write(this.peoplePath, JSON.stringify(this.store, null, 2) + "\n");
  }
  activePeople() {
    return [...this.people.values()].filter((p) => !p.deleted);
  }
  linkFor(p) {
    return `[@${p.name}](${slackUrl(p.team || this.team, p.id)})`;
  }

  /* ---------- Token (public SecretStorage API: setSecret / getSecret / listSecrets) ---------- */
  // Obsidian silently falls back to plain-text storage when OS encryption is unavailable. The check method isn't part
  // of the public API, so it's feature-detected: if it exists and says no, refuse to store or read the token.
  encryptionAvailable() {
    const ss = this.app.secretStorage;
    if (!ss) return false;
    return typeof ss.isEncryptionAvailable === "function" ? !!ss.isEncryptionAvailable() : true;
  }
  hasToken() {
    return this.encryptionAvailable() && this.app.secretStorage.listSecrets().includes(SECRET_ID);
  }
  getToken() {
    if (!this.encryptionAvailable()) throw new Error(T.errNoEncryption);
    const token = this.app.secretStorage.getSecret(SECRET_ID);
    if (!token) throw new Error(T.errNoToken);
    return token;
  }
  saveToken(value) {
    if (!this.encryptionAvailable()) throw new Error(T.errCannotSave);
    this.app.secretStorage.setSecret(SECRET_ID, value);
    this.statusCache.clear();
  }
  // Pre-release builds let you name the secret (data.json "secretName") or used "slack-people".
  // Copy that entry to the fixed ID once; the old entry is left untouched.
  async migrateSecretName() {
    const ss = this.app.secretStorage;
    if (ss && this.encryptionAvailable() && !ss.listSecrets().includes(SECRET_ID)) {
      for (const old of [this.settings.secretName, "slack-people"]) {
        const v = old && old !== SECRET_ID && ss.listSecrets().includes(old) ? ss.getSecret(old) : null;
        if (v) {
          ss.setSecret(SECRET_ID, v);
          break;
        }
      }
    }
    if ("secretName" in this.settings) {
      delete this.settings.secretName;
      await this.saveSettings();
    }
  }

  /* ---------- Slack Web API ---------- */
  async api(method, params = {}, retries = 3) {
    const token = this.getToken();
    const qs = new URLSearchParams(params).toString();
    const res = await requestUrl({
      url: `https://slack.com/api/${method}${qs ? `?${qs}` : ""}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      throw: false,
    });
    if (res.status === 429 && retries > 0) {
      const wait = Number(res.headers["retry-after"] || res.headers["Retry-After"] || 3);
      await sleep(wait * 1000);
      return this.api(method, params, retries - 1);
    }
    const json = res.json;
    if (!json || !json.ok) throw new SlackError((json && json.error) || `http_${res.status}`, json && json.needed);
    return { json, headers: res.headers };
  }

  // Workspace, token type and granted scopes (from the x-oauth-scopes header). Never returns the token itself.
  async testConnection() {
    const token = this.getToken();
    const type = token.startsWith("xoxp-") ? T.tokenUser : token.startsWith("xoxb-") ? T.tokenBot : T.tokenOther;
    const { json, headers } = await this.api("auth.test");
    const raw = headers["x-oauth-scopes"] || headers["X-OAuth-Scopes"] || "";
    const scopes = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return {
      type,
      team: json.team,
      user: json.user,
      teamId: json.team_id,
      enterpriseId: json.enterprise_id || "",
      scopes,
      missing: NEEDED_SCOPES.filter((s) => !scopes.includes(s)),
      extra: scopes.filter((s) => !NEEDED_SCOPES.includes(s)),
    };
  }

  // Page through users.list, skip bots, keep deactivated people flagged (hidden from suggestions, names still resolve)
  async syncDirectory({ notify = false, onProgress } = {}) {
    if (this.syncing) return;
    this.syncing = true;
    const notice = notify ? new Notice(T.syncing, 0) : null;
    try {
      const fetched = [];
      let cursor = "";
      let teamParam = null;
      do {
        const params = { limit: "200" };
        if (cursor) params.cursor = cursor;
        if (teamParam) params.team_id = teamParam;
        let json;
        try {
          ({ json } = await this.api("users.list", params));
        } catch (e) {
          // Org-wide Enterprise Grid tokens must name a workspace
          if (e.code === "missing_argument" && !teamParam) {
            teamParam = (await this.api("auth.test")).json.team_id;
            continue;
          }
          throw e;
        }
        for (const m of json.members || []) {
          if (m.is_bot || m.id === "USLACKBOT") continue;
          fetched.push(toPerson(m));
        }
        cursor = (json.response_metadata && json.response_metadata.next_cursor) || "";
        if (onProgress) onProgress(fetched.length);
        if (notice) notice.setMessage(T.syncingN(fetched.length));
        if (cursor) await sleep(1200);
      } while (cursor);

      // Merge: keep local aliases and manually added people
      for (const p of fetched) {
        const old = this.people.get(p.id);
        this.people.set(p.id, Object.assign({}, old, p, { aliases: (old && old.aliases) || [], source: "sync" }));
      }

      // users.list only covers the token's workspace (Enterprise Grid has several). Look up, one by one, people who
      // are mentioned in notes or were added by hand but weren't in that list; users.info works across the org.
      const fetchedIds = new Set(fetched.map((p) => p.id));
      const extraIds = new Set();
      for (const [id, set] of this.mentions) if (set.size && !fetchedIds.has(id)) extraIds.add(id);
      for (const p of this.people.values()) if (p.source !== "sync" && !fetchedIds.has(p.id)) extraIds.add(p.id);
      let extra = 0;
      for (const id of extraIds) {
        try {
          const { json } = await this.api("users.info", { user: id });
          if (!json.user || json.user.is_bot) continue;
          const p = toPerson(json.user);
          const old = this.people.get(p.id);
          this.people.set(p.id, Object.assign({}, old, p, { aliases: (old && old.aliases) || [], source: (old && old.source !== "sync" && old.source) || "other" }));
          extra++;
        } catch (e) {
          // user_not_found etc.: leave that mention unresolved
          if (e.code === "ratelimited" || e.code === "invalid_auth" || e.code === "token_revoked") throw e;
        }
        if (onProgress) onProgress(fetched.length + extra);
        await sleep(300);
      }
      if (!this.team && fetched.length) this.team = (fetched.find((p) => !p.deleted) || {}).team || "";
      this.store.syncedAt = Date.now();
      this.store.lastError = "";
      await this.savePeople();
      const active = fetched.filter((p) => !p.deleted).length;
      if (notice) notice.setMessage(T.syncDone(active, fetched.length - active) + (extra ? T.syncExtra(extra) : ""));
      return { total: fetched.length, active, extra };
    } catch (e) {
      this.store.lastError = e.message;
      await this.savePeople();
      if (notice) notice.setMessage(T.syncFailed(e.message));
      throw e;
    } finally {
      this.syncing = false;
      if (notice) setTimeout(() => notice.hide(), 4000);
    }
  }
  async maybeAutoSync() {
    if (!this.settings.autoSync || !this.hasToken()) return;
    if (Date.now() - (this.store.syncedAt || 0) < DAY) return;
    try {
      await this.syncDirectory();
    } catch (e) {
      console.warn("Slack Mentions: auto sync failed", e.message);
    }
  }
  async addByEmail(email) {
    const { json } = await this.api("users.lookupByEmail", { email });
    const p = toPerson(json.user);
    const old = this.people.get(p.id);
    this.people.set(p.id, Object.assign({}, old, p, { aliases: (old && old.aliases) || [], source: (old && old.source) || "manual" }));
    if (!this.team) this.team = p.team;
    await this.savePeople();
    return p;
  }
  // Slack status for the profile card: fetched live via users.info, cached for 5 minutes
  async fetchStatus(id) {
    const hit = this.statusCache.get(id);
    if (hit && Date.now() - hit.at < STATUS_TTL) return hit.text;
    const { json } = await this.api("users.info", { user: id });
    const text = ((json.user && json.user.profile && json.user.profile.status_text) || "").trim();
    this.statusCache.set(id, { text, at: Date.now() });
    return text;
  }

  /* ---------- Mention index: which notes mention whom ---------- */
  async indexMentions() {
    this.mentions = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) await this.indexFile(f);
  }
  async indexFile(f) {
    if (!f || f.extension !== "md") return;
    this.dropFile(f.path);
    const text = await this.app.vault.cachedRead(f);
    for (const m of text.matchAll(LINK_RE)) {
      if (!this.mentions.has(m[3])) this.mentions.set(m[3], new Set());
      this.mentions.get(m[3]).add(f.path);
    }
  }
  dropFile(path) {
    for (const set of this.mentions.values()) set.delete(path);
  }
  mentionCount(id) {
    return (this.mentions.get(id) || new Set()).size;
  }

  /* ---------- Chips ---------- */
  buildChip(el, id, fallbackName, href) {
    const p = this.people.get(id);
    const name = p ? p.name : fallbackName.replace(/^@/, "");
    el.empty();
    el.addClass("sp-chip");
    el.toggleClass("is-unknown", !p);
    el.toggleClass("is-deleted", !!(p && p.deleted));
    if (this.settings.showAvatar) renderAvatar(el, p, id, name, "", true);
    el.createSpan({ cls: "sp-name", text: name });
    el.dataset.spId = id;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Live Preview chips already handled mousedown
      if (el.dataset.spOpenOnDown) return;
      this.activate(el, id, href);
    });
    el.addEventListener("mouseenter", () => {
      if (this.settings.clickAction === "slack") this.scheduleCard(el, id, href);
      else clearTimeout(this.hideTimer);
    });
    el.addEventListener("mouseleave", () => this.scheduleHide());
  }
  activate(el, id, href) {
    if (this.settings.clickAction === "card") {
      if (this.card && this.cardAnchor === el) this.hideCard();
      else this.showCard(el, id, href);
      return;
    }
    this.hideCard();
    openSlack(href);
  }
  decorateAnchor(a) {
    const href = a.getAttribute("href");
    const u = parseUrl(href);
    if (!u || a.hasClass("sp-chip")) return;
    a.removeClass("external-link");
    a.removeAttribute("title");
    a.removeAttribute("aria-label");
    this.buildChip(a, u.id, a.textContent, href);
  }

  livePreviewExtension() {
    const plugin = this;
    class ChipWidget extends WidgetType {
      constructor(name, team, id) {
        super();
        this.name = name;
        this.team = team;
        this.id = id;
        this.version = plugin.renderVersion;
      }
      eq(o) {
        return o.name === this.name && o.id === this.id && o.team === this.team && o.version === this.version;
      }
      toDOM() {
        const href = slackUrl(this.team, this.id);
        const el = createEl("a", { attr: { href } });
        plugin.buildChip(el, this.id, this.name, href);
        // CodeMirror swallows the click that follows, so act on mousedown; this also keeps the cursor out of the link
        el.dataset.spOpenOnDown = "1";
        el.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          plugin.activate(el, this.id, href);
        });
        return el;
      }
      ignoreEvent() {
        return true;
      }
    }
    const build = (view) => {
      const b = new RangeSetBuilder();
      if (!view.state.field(editorLivePreviewField, false)) return b.finish();
      const sel = view.state.selection.ranges;
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const m of text.matchAll(LINK_RE)) {
          const s = from + m.index, e = s + m[0].length;
          // Show the source while the cursor is inside the link
          if (sel.some((r) => r.from <= e && r.to >= s)) continue;
          b.add(s, e, Decoration.replace({ widget: new ChipWidget(m[1], m[2], m[3]) }));
        }
      }
      return b.finish();
    };
    return ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = build(view);
        }
        update(u) {
          const lp = (s) => s.field(editorLivePreviewField, false);
          const forced = u.transactions.some((t) => t.effects.some((e) => e.is(refreshEffect)));
          if (forced || u.docChanged || u.viewportChanged || u.selectionSet || lp(u.startState) !== lp(u.state)) this.decorations = build(u.view);
        }
      },
      { decorations: (v) => v.decorations }
    );
  }

  // Re-render open notes after a display setting changes
  refreshViews() {
    this.renderVersion++;
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const v = leaf.view;
      if (v.previewMode) v.previewMode.rerender(true);
      if (v.editor && v.editor.cm) v.editor.cm.dispatch({ effects: refreshEffect.of(null) });
    });
  }

  /* ---------- Profile card ---------- */
  scheduleCard(anchor, id, href) {
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    if (this.card && this.cardAnchor === anchor) return;
    this.showTimer = setTimeout(() => this.showCard(anchor, id, href), this.settings.hoverDelay);
  }
  scheduleHide() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hideCard(), 200);
  }
  hideCard() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    if (this.card) this.card.remove();
    this.card = null;
    this.cardAnchor = null;
  }
  showCard(anchor, id, href) {
    if (!anchor.isConnected) return;
    this.hideCard();
    const p = this.people.get(id);
    const name = p ? p.name : anchor.textContent.trim();
    const card = anchor.doc.body.createDiv({ cls: "sp-card" });
    card.addEventListener("mouseenter", () => clearTimeout(this.hideTimer));
    card.addEventListener("mouseleave", () => this.scheduleHide());

    const head = card.createDiv({ cls: "sp-card-head" });
    renderAvatar(head, p, id, name, "is-lg", true);
    const who = head.createDiv({ cls: "sp-card-who" });
    who.createDiv({ cls: "sp-card-name", text: name });
    const sub = !p ? T.notInDirectory : p.deleted ? T.deactivated : [p.en, p.username && `@${p.username}`].filter(Boolean).join(" · ");
    who.createDiv({ cls: "sp-card-sub", text: sub });

    if (p) {
      const meta = card.createDiv({ cls: "sp-card-meta" });
      const statusEl = meta.createDiv({ cls: "sp-card-row sp-card-status" });
      statusEl.hide();
      if (p.title) meta.createDiv({ cls: "sp-card-row", text: p.title });
      if (p.email) meta.createDiv({ cls: "sp-card-row is-mono", text: p.email });
      if (p.tz) {
        try {
          const t = new Intl.DateTimeFormat(LANG === "zh" ? "zh-CN" : undefined, { timeZone: p.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
          meta.createDiv({ cls: "sp-card-row", text: T.localTime(t) });
        } catch (e) {
          // unknown time zone: skip the row
        }
      }
      if (this.hasToken() && !p.deleted) {
        this.fetchStatus(id)
          .then((text) => {
            if (text && statusEl.isConnected) {
              statusEl.setText(T.status(text));
              statusEl.show();
            }
          })
          .catch(() => {});
      }
    }

    const btn = card.createEl("button", { cls: "sp-card-btn mod-cta", text: T.sendMessage });
    btn.addEventListener("click", () => {
      openSlack(href);
      this.hideCard();
    });

    const files = [...(this.mentions.get(id) || [])].sort();
    const sec = card.createDiv({ cls: "sp-card-notes" });
    sec.createDiv({ cls: "sp-card-label", text: T.mentionedIn(files.length) });
    for (const path of files.slice(0, 5)) {
      const a = sec.createEl("a", { cls: "sp-card-note", text: path.replace(/^.*\//, "").replace(/\.md$/, "") });
      a.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(path, "", false);
        this.hideCard();
      });
    }
    if (files.length > 5) sec.createDiv({ cls: "sp-card-more", text: T.moreNotes(files.length - 5) });

    // Below the chip by default, flipped above / pulled left when it would overflow the window
    const win = anchor.win;
    const r = anchor.getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top = r.bottom + 6;
    if (top + ch > win.innerHeight - 8) top = r.top - 6 - ch;
    const left = Math.max(8, Math.min(r.left, win.innerWidth - cw - 8));
    card.style.top = `${Math.round(top)}px`;
    card.style.left = `${Math.round(left)}px`;
    this.card = card;
    this.cardAnchor = anchor;
  }

  // Mentions of people missing from the directory or deactivated
  checkLinks() {
    const problems = [];
    for (const [id, set] of this.mentions) {
      if (!set.size) continue;
      const p = this.people.get(id);
      if (!p) problems.push({ id, reason: T.notInDirectory, files: [...set] });
      else if (p.deleted) problems.push({ id, name: p.name, reason: T.deactivated, files: [...set] });
    }
    return problems;
  }
};

/* ---------- Search & suggestions ---------- */
const matchPerson = (p, q) => {
  if (!q) return true;
  q = q.toLowerCase();
  return [p.name, p.en, p.username, p.email, ...(p.aliases || [])].some((v) => v && v.toLowerCase().includes(q));
};

const renderPerson = (plugin, p, el) => {
  el.addClass("sp-suggest");
  renderAvatar(el, p, p.id, p.name, "", plugin.settings.showAvatar);
  const box = el.createDiv({ cls: "sp-suggest-text" });
  const line = box.createDiv({ cls: "sp-suggest-name", text: p.name });
  if (p.en) line.createSpan({ cls: "sp-suggest-en", text: p.en });
  box.createDiv({ cls: "sp-suggest-sub", text: p.title || p.email || "" });
};

class PeopleSuggest extends EditorSuggest {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.limit = 30;
  }
  onTrigger(cursor, editor) {
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    // Not inside inline code
    if ((before.match(/`/g) || []).length % 2) return null;
    const m = before.match(TRIGGER_RE);
    if (!m) return null;
    return { start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 }, end: cursor, query: m[1] };
  }
  getSuggestions(ctx) {
    const pl = this.plugin;
    // People already mentioned in notes first, then by name
    return pl
      .activePeople()
      .filter((p) => matchPerson(p, ctx.query))
      .sort((a, b) => pl.mentionCount(b.id) - pl.mentionCount(a.id) || byName(a, b))
      .slice(0, 30);
  }
  renderSuggestion(p, el) {
    renderPerson(this.plugin, p, el);
  }
  selectSuggestion(p) {
    const ctx = this.context;
    if (!ctx) return;
    const next = ctx.editor.getRange(ctx.end, { line: ctx.end.line, ch: ctx.end.ch + 1 });
    ctx.editor.replaceRange(this.plugin.linkFor(p) + (next === " " ? "" : " "), ctx.start, ctx.end);
  }
}

class PeopleModal extends FuzzySuggestModal {
  constructor(plugin, editor) {
    super(plugin.app);
    this.plugin = plugin;
    this.editor = editor;
    this.setPlaceholder(T.modalPlaceholder);
  }
  getItems() {
    return this.plugin.activePeople();
  }
  getItemText(p) {
    return [p.name, p.en, p.username, p.email, ...(p.aliases || [])].filter(Boolean).join(" ");
  }
  renderSuggestion(match, el) {
    renderPerson(this.plugin, match.item, el);
  }
  onChooseItem(p) {
    this.editor.replaceSelection(this.plugin.linkFor(p));
  }
}

/* ---------- Settings tab ---------- */
class SlackMentionsSettingTab extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.query = "";
    this.replacingToken = false;
  }

  display() {
    const { containerEl } = this;
    const plugin = this.plugin;
    containerEl.empty();
    containerEl.addClass("sp-settings");

    /* 1. Connection */
    new Setting(containerEl).setName(T.hConnection).setHeading();
    const encOk = plugin.encryptionAvailable();
    const tokenSetting = new Setting(containerEl).setName(T.tokenName).setDesc(
      createFragment((f) => {
        f.appendText(T.tokenDesc);
        f.createEl("a", { text: T.howToCreate, href: HELP_URL[LANG] });
      })
    );
    if (!encOk) {
      tokenSetting.descEl.createDiv({ cls: "sp-warn", text: T.noEncryption });
    } else if (plugin.hasToken() && !this.replacingToken) {
      tokenSetting.controlEl.createSpan({ cls: "sp-token-saved", text: T.tokenSaved });
      tokenSetting.addButton((b) =>
        b.setButtonText(T.replace).onClick(() => {
          this.replacingToken = true;
          this.display();
        })
      );
      tokenSetting.descEl.createDiv({ cls: "sp-hint", text: T.tokenRemoveHint(SECRET_ID) });
    } else {
      let input;
      tokenSetting.addText((t) => {
        input = t;
        t.setPlaceholder(T.tokenPlaceholder);
        t.inputEl.type = "password";
        t.inputEl.autocomplete = "off";
        t.inputEl.spellcheck = false;
      });
      tokenSetting.addButton((b) =>
        b
          .setButtonText(T.save)
          .setCta()
          .onClick(() => {
            const v = input.getValue().trim();
            if (!/^xox[a-z]-/.test(v)) {
              new Notice(T.notAToken);
              return;
            }
            try {
              plugin.saveToken(v);
            } catch (e) {
              new Notice(e.message);
              return;
            }
            input.setValue("");
            this.replacingToken = false;
            new Notice(T.tokenStored);
            this.display();
          })
      );
      if (this.replacingToken) {
        tokenSetting.addButton((b) =>
          b.setButtonText(T.cancel).onClick(() => {
            this.replacingToken = false;
            this.display();
          })
        );
      }
    }

    const needToken = !plugin.hasToken();
    // Token-dependent controls are disabled until a token is saved, with a note saying why
    const markNeedToken = (setting) => {
      if (needToken) setting.descEl.createDiv({ cls: "sp-hint", text: T.needToken });
    };
    const testSetting = new Setting(containerEl).setName(T.testName).setDesc(T.testDesc);
    markNeedToken(testSetting);
    const result = containerEl.createDiv({ cls: "sp-test-result" });
    result.hide();
    testSetting.addButton((b) =>
      b
        .setButtonText(T.testBtn)
        .setDisabled(needToken)
        .onClick(async () => {
          b.setDisabled(true).setButtonText(T.testing);
          result.empty();
          result.show();
          try {
            const r = await plugin.testConnection();
            const row = (k, v, cls) => {
              const d = result.createDiv({ cls: cls ? `sp-test-row ${cls}` : "sp-test-row" });
              d.createSpan({ cls: "sp-test-key", text: k });
              d.createSpan({ cls: "sp-test-val", text: v });
            };
            row(T.rowWorkspace, r.enterpriseId ? T.workspaceEnterprise(r.team, r.enterpriseId) : T.workspacePlain(r.team, r.teamId));
            row(T.rowIdentity, `${r.user} · ${r.type}`);
            row(T.rowScopes, r.scopes.join(T.listSep) || T.noScopes);
            if (r.missing.length) row(T.rowMissing, T.missingScopes(r.missing.join(T.listSep)), "is-error");
            if (r.extra.length) row(T.rowWarning, T.extraScopes(r.extra.join(T.listSep)), "is-warn");
            if (!r.missing.length && !r.extra.length) row(T.rowResult, T.scopesOk, "is-ok");
          } catch (e) {
            result.createDiv({ cls: "sp-test-row is-error", text: T.connFailed(e.message) });
          } finally {
            b.setDisabled(false).setButtonText(T.testBtn);
          }
        })
    );

    /* 2. Sync */
    new Setting(containerEl).setName(T.hSync).setHeading();
    new Setting(containerEl)
      .setName(T.autoSyncName)
      .setDesc(T.autoSyncDesc)
      .addToggle((t) =>
        t.setValue(plugin.settings.autoSync).onChange(async (v) => {
          plugin.settings.autoSync = v;
          await plugin.saveSettings();
        })
      );
    const active = plugin.activePeople().length;
    const syncSetting = new Setting(containerEl).setName(T.syncNowName).setDesc(T.syncSummary(fmtTime(plugin.store.syncedAt), active, plugin.people.size - active));
    if (plugin.store.lastError) syncSetting.descEl.createDiv({ cls: "sp-warn", text: T.lastSyncFailed(plugin.store.lastError) });
    syncSetting.descEl.createDiv({ cls: "sp-hint", text: T.syncHint });
    markNeedToken(syncSetting);
    syncSetting.addButton((b) =>
      b
        .setButtonText(T.syncNowBtn)
        .setDisabled(needToken)
        .onClick(async () => {
          b.setDisabled(true).setButtonText(T.syncingBtn);
          try {
            await plugin.syncDirectory({ onProgress: (n) => b.setButtonText(T.fetchedN(n)) });
          } catch (e) {
            new Notice(T.syncFailed(e.message));
          }
          this.display();
        })
    );

    /* 3. Directory */
    new Setting(containerEl).setName(T.hDirectory).setHeading();
    let emailInput;
    const addSetting = new Setting(containerEl)
      .setName(T.addByEmailName)
      .setDesc(T.addByEmailDesc)
      .addText((t) => {
        emailInput = t;
        t.setPlaceholder("name@example.com");
        t.inputEl.type = "email";
        t.setDisabled(needToken);
      })
      .addButton((b) =>
        b
          .setButtonText(T.addBtn)
          .setDisabled(needToken)
          .onClick(async () => {
            const email = emailInput.getValue().trim();
            if (!email) return;
            b.setDisabled(true);
            try {
              const p = await plugin.addByEmail(email);
              new Notice(T.added(p.name));
              emailInput.setValue("");
              this.display();
            } catch (e) {
              new Notice(T.addFailed(e.message));
              b.setDisabled(false);
            }
          })
      );
    markNeedToken(addSetting);

    let list;
    new Setting(containerEl)
      .setName(T.searchName)
      .setDesc(T.searchDesc)
      .addSearch((s) => {
        s.setPlaceholder(T.searchPeople).setValue(this.query);
        s.onChange((v) => {
          this.query = v;
          this.renderList(list);
        });
      });
    list = containerEl.createDiv({ cls: "sp-people-list" });
    this.renderList(list);

    /* 4. Display */
    new Setting(containerEl).setName(T.hDisplay).setHeading();
    new Setting(containerEl)
      .setName(T.showAvatarName)
      .setDesc(T.showAvatarDesc)
      .addToggle((t) =>
        t.setValue(plugin.settings.showAvatar).onChange(async (v) => {
          plugin.settings.showAvatar = v;
          await plugin.saveSettings();
          plugin.refreshViews();
        })
      );
    new Setting(containerEl)
      .setName(T.clickName)
      .setDesc(T.clickDesc)
      .addDropdown((d) =>
        d
          .addOption("slack", T.clickSlack)
          .addOption("card", T.clickCard)
          .setValue(plugin.settings.clickAction)
          .onChange(async (v) => {
            plugin.settings.clickAction = v;
            await plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName(T.hoverName)
      .setDesc(T.hoverDesc)
      .addDropdown((d) => {
        for (const ms of [200, 350, 600, 1000]) d.addOption(String(ms), T.seconds(ms / 1000));
        d.setValue(String(plugin.settings.hoverDelay)).onChange(async (v) => {
          plugin.settings.hoverDelay = Number(v);
          await plugin.saveSettings();
        });
      });

    /* 5. Maintenance */
    new Setting(containerEl).setName(T.hCheck).setHeading();
    const checkOut = createDiv({ cls: "sp-check-result" });
    new Setting(containerEl)
      .setName(T.checkName)
      .setDesc(T.checkDesc)
      .addButton((b) =>
        b.setButtonText(T.checkBtn).onClick(async () => {
          await plugin.indexMentions();
          this.renderCheck(checkOut);
        })
      );
    containerEl.appendChild(checkOut);
  }

  renderList(list) {
    const plugin = this.plugin;
    list.empty();
    const all = [...plugin.people.values()].filter((p) => matchPerson(p, this.query.trim()));
    all.sort((a, b) => (a.deleted ? 1 : 0) - (b.deleted ? 1 : 0) || plugin.mentionCount(b.id) - plugin.mentionCount(a.id) || byName(a, b));
    if (!all.length) {
      list.createDiv({ cls: "sp-empty", text: plugin.people.size ? T.emptyNoMatch : T.emptyDirectory });
      return;
    }
    for (const p of all.slice(0, LIST_LIMIT)) {
      const row = list.createDiv({ cls: "sp-row" + (p.deleted ? " is-deleted" : "") });
      renderAvatar(row, p, p.id, p.name, "", plugin.settings.showAvatar);
      const info = row.createDiv({ cls: "sp-row-info" });
      const line = info.createDiv({ cls: "sp-row-name", text: p.name });
      if (p.en) line.createSpan({ cls: "sp-row-en", text: p.en });
      if (p.deleted) line.createSpan({ cls: "sp-badge", text: T.badgeDeleted });
      else if (p.source === "other") line.createSpan({ cls: "sp-badge", text: T.badgeOtherWorkspace });
      else if (p.source !== "sync") line.createSpan({ cls: "sp-badge", text: T.badgeManual });
      info.createDiv({ cls: "sp-row-sub", text: [p.email, p.title].filter(Boolean).join(" · ") });
      const n = plugin.mentionCount(p.id);
      row.createDiv({ cls: "sp-row-count", text: n ? T.notesCount(n) : "" });
      const alias = row.createEl("input", { cls: "sp-row-alias", attr: { type: "text", placeholder: T.aliasPlaceholder, value: (p.aliases || []).join(T.listSep) } });
      alias.addEventListener("change", async () => {
        p.aliases = alias.value.split(/[,，、]+/).map((s) => s.trim()).filter(Boolean);
        await plugin.savePeople();
      });
      if (p.source !== "sync") {
        const del = row.createEl("button", { cls: "sp-row-del clickable-icon", attr: { "aria-label": T.removeFromDirectory } });
        setIcon(del, "trash-2");
        del.addEventListener("click", async () => {
          plugin.people.delete(p.id);
          await plugin.savePeople();
          this.renderList(list);
        });
      }
    }
    if (all.length > LIST_LIMIT) list.createDiv({ cls: "sp-more", text: T.showingFirst(all.length, LIST_LIMIT) });
  }

  renderCheck(out) {
    const plugin = this.plugin;
    out.empty();
    const problems = plugin.checkLinks();
    if (!problems.length) {
      out.createDiv({ cls: "sp-test-row is-ok", text: T.checkOk([...plugin.mentions.values()].filter((s) => s.size).length) });
      return;
    }
    for (const pr of problems) {
      const row = out.createDiv({ cls: "sp-check-row" });
      row.createSpan({ cls: "sp-check-who", text: pr.name ? `${pr.name} (${pr.id})` : pr.id });
      row.createSpan({ cls: "sp-badge", text: pr.reason });
      const files = row.createDiv({ cls: "sp-check-files" });
      for (const path of pr.files) {
        const a = files.createEl("a", { text: path.replace(/\.md$/, "") });
        a.addEventListener("click", (e) => {
          e.preventDefault();
          plugin.app.workspace.openLinkText(path, "", false);
        });
      }
    }
  }
}
