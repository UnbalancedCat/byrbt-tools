# 维护与发布

源码位于公开仓库，安装包只由版本标签发布到 Releases。项目不发布 npm 包，`package.json` 中的 `private: true` 用于防止误发布到 npm，不影响 GitHub 开源。

## 日常开发

使用 Node.js 24：`npm ci`，修改后运行 `npm run check`。修改图标 SVG 后运行 `npm run icons` 并提交 SVG 与两张 PNG；检查任务会验证二者一致。

`dist/` 为生成目录，不提交。`test-results/`、`backups/`、环境变量文件和本地日志被忽略。测试只使用虚构样例，不将站点真实页面、私信、个人名单或账号信息用于公开 fixture。

## 发布新版本

1. 更新 `package.json` 和 lockfile 的版本，编写 `docs/releases/vX.Y.Z.md`，更新用户文档和验收记录。
2. 运行 `npm run check`。检查发布差异，提交并推送 `main`；等待 Checks 成功。
3. 创建并推送与包版本完全相同的 `vX.Y.Z` 标签。不要改动或覆盖已发布标签。
4. Release 工作流再次检查版本、安装依赖、执行测试并构建；先上传完整附件到草稿 Release，再公开发布并设为 latest。
5. 核验 `.user.js`、`.meta.js` 和 `SHA256SUMS.txt` 三个附件、固定 latest 链接及浏览器安装/更新。

安装和更新地址分别是：

- `https://github.com/UnbalancedCat/byrbt-tools/releases/latest/download/byrbt-tools.user.js`
- `https://github.com/UnbalancedCat/byrbt-tools/releases/latest/download/byrbt-tools.meta.js`

发布任务失败时不会把未上传完整的草稿公开。若留下草稿，先检查失败原因；确认没有公开使用后可清理该草稿再重跑，不覆盖已公开的版本。发现已发布版本有缺陷时递增版本发布修复，不替换同版本安装包。

## 验证更新链路

仅在本机隔离验收中使用同名称、同 namespace、低于正式版本号的测试包；它仍指向正式 Release 更新地址。用 Tampermonkey 手动检查更新，确认升级到正式版、配置保留且只有一份脚本运行。测试包不提交、不附到 Release；无法完成时在验收记录明确标为待验证。
