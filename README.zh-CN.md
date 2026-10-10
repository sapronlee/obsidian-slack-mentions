# Slack Mentions

在 Obsidian 笔记里像在 Slack 里一样 @ 同事。

输入 `@`、选人，提及会显示成带头像的胶囊。点击打开这个人的 Slack；鼠标悬停弹出资料卡，显示职位、邮箱、当地时间、Slack 状态，以及还有哪些笔记提到了他。

[English](README.md)

## 功能

- **@ 补全**：输入时按名字、用户名、邮箱或自定义别名（花名、拼音等）搜索。
- **头像胶囊**：阅读模式和编辑模式（实时预览）都会渲染；光标移进胶囊会露出链接源码，方便修改。
- **资料卡**：悬停显示职位、邮箱、当地时间、Slack 状态、「在 Slack 中发消息」按钮，以及提到这个人的笔记。
- **通讯录同步**：从 Slack 工作区同步，每天自动一次或手动触发。排除机器人；已停用的人保留在库里，旧链接仍能显示名字。企业版（Enterprise Grid）的成员列表只包含 token 所在工作区，笔记里提到的、按邮箱添加的人会在整个组织范围内单独补查。
- **按邮箱添加**：补充通讯录里没有的人。
- **检查**：列出指向已停用账号、或人员库里没有的人的链接。
- 界面支持英文和简体中文，跟随 Obsidian 的语言设置。

## 提及的存储格式

提及就是一个普通的 Markdown 链接：

```markdown
[@张三](slack://user?team=T0123ABCD&id=U0123ABCD)
```

笔记保持可移植：即使不装插件，它也是一个能打开 Slack 的普通链接。

## 配置

### 1. 创建 Slack token

插件只需要两个**只读**权限：`users:read` 和 `users:read.email`。建议专门建一个只有这两个权限的 token，不要复用权限更大的 token。

1. 打开 [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**，选择你的工作区。
2. 进入 **OAuth & Permissions**，在 **User Token Scopes** 里添加 `users:read` 和 `users:read.email`。
3. 点 **Install to Workspace** 并授权。企业版（Enterprise Grid）或限制了应用安装的工作区，可能需要管理员审批。
4. 复制 **User OAuth Token**（以 `xoxp-` 开头）。

拥有同样两个权限的机器人 token（`xoxb-`）也可以。

### 2. 在 Obsidian 里保存

打开 **设置 → Slack Mentions**，把 token 粘贴到 **Slack token** 一栏，点 **保存**。然后点 **测试连接**，会显示工作区、token 类型和实际权限，权限缺少或超出需要时会提醒。

最后点 **立即同步**，或保持 **每天自动同步** 开启。

不配 token 也能用：已有的提及照常显示，人员库可以手动维护，只是同步、按邮箱添加和 Slack 状态不可用。

## 使用

- 在编辑器里输入 `@` 加几个字母，选择人员。命令 **Slack Mentions: 插入人员** 效果相同。
- 点击胶囊打开 Slack；可以在设置里改成「弹出资料卡」。
- **设置 → 人员库** 列出所有人和被提到的笔记数，也可以在这里加别名。

## 隐私与安全

- **网络请求**：插件只访问 Slack Web API（`https://slack.com/api/`），调用 `auth.test`、`users.list`、`users.lookupByEmail`、`users.info`，全部只读。不向其他地方发送任何数据，没有统计上报。
- **token**：存在 Obsidian 钥匙串（设置 → 钥匙串）里 ID 为 `slack-mentions` 的一项，由操作系统加密，不会写进 vault 或 `data.json`。系统加密不可用时，插件会拒绝保存和使用 token，不会退回明文。要删除 token，到「设置 → 钥匙串」删除 `slack-mentions`。
- **人员库**：同步下来的通讯录（姓名、邮箱、职位、时区、头像地址）缓存在 vault 里的 `.obsidian/plugins/slack-mentions/people.json`。**如果你用 Git、Obsidian Sync 或网盘同步 `.obsidian` 目录，这个文件会一起被同步。** 不希望同事信息离开本机的话，请排除它。Git 的写法：

  ```gitignore
  .obsidian/plugins/slack-mentions/people.json
  ```

- **头像**：显示时从 Slack 的图片 CDN 加载。

## 要求

- Obsidian 1.11.4 及以上（需要钥匙串接口）。仅支持桌面端，因为打开 Slack 链接依赖系统的协议处理。
- Slack 账号；使用同步功能需要按上面的步骤创建 token。

## 许可证

[MIT](LICENSE)
