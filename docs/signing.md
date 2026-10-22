# 代码签名与公证（macOS / Windows）

Arena Watch 目前发布的是**未签名**安装包：

- macOS：首次打开需要右键 →「打开」，或
  `xattr -dr com.apple.quarantine "/Applications/Arena Watch.app"`；
  未签名时 Squirrel.Mac 会拒绝安装自动更新。
- Windows：SmartScreen 会提示「未知发布者」，用户需点「更多信息 → 仍要运行」。

要消除这些问题，需要证书材料。下面是完整流程和**需要你提供的东西**。
所有证书/密码只放 GitHub Actions Secrets，绝不进仓库。

## macOS

### 1. 需要的前置条件

| 材料 | 说明 |
| --- | --- |
| Apple Developer Program 会员 | 个人或组织账号，年费 99 美元；需要 Account Holder 或 Admin 权限 |
| Developer ID Application 证书 | 在 developer.apple.com → Certificates → **Developer ID Application** 创建，下载 `.cer` 导入钥匙串后导出 `.p12`（设一个导出密码） |
| Team ID | 10 位，developer.apple.com → Membership 页面 |
| 公证凭据（二选一） | ① Apple ID + **App 专用密码**（appleid.apple.com → 登录与安全 → App 专用密码）<br>② App Store Connect API Key：`.p8` 文件 + Key ID + Issuer ID |

> 说明：Developer ID 证书用于本地签名；公证（notarization）是苹果的云端扫描，
> 需要单独的凭据，二者缺一不可。分发方式不是 App Store，所以用 Developer ID，
> 不是 "Apple Distribution" 证书。

### 2. 仓库里需要改的地方（我来做，拿到材料后）

- 新增 `build/entitlements.mac.plist`（Electron 需要 JIT 权限）：
  `com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory`、
  `disable-library-validation`。
- `package.json` → `build.mac`：
  `hardenedRuntime: true`、`gatekeeperAssess: false`、
  `entitlements` / `entitlementsInherit` 指向上面的文件、
  `notarize: true`。
- `.github/workflows/release.yml` 的构建步骤加环境变量（值来自 Secrets）：
  `CSC_LINK`（`.p12` 的 base64）、`CSC_KEY_PASSWORD`、
  `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；
  若用 API Key 则改为 `APPLE_API_KEY`（`.p8` 的 base64 或路径）、
  `APPLE_API_KEY_ID`、`APPLE_API_ISSUER`。
- 产物验证：`codesign --verify --deep --strict`、
  `spctl -a -vv`（应显示 `source=Notarized Developer ID`）、
  `xcrun notarytool log` 查看公证日志。

### 3. 需要你提供（或直接在 GitHub 仓库 Settings → Secrets 里添加）

1. `Developer ID Application` 的 `.p12` 文件 + 导出密码；
2. Team ID；
3. 公证二选一：
   - Apple ID + App 专用密码；或
   - `.p8` + Key ID + Issuer ID。

建议直接用 `gh secret set CSC_LINK < cert.p12.base64` 这种方式添加，
不要通过聊天工具发明文密码。

## Windows

### 1. 可选方案

| 方案 | 适用 | 说明 |
| --- | --- | --- |
| OV/EV 代码签名证书（`.pfx`） | 传统方式 | 2023 年后多数 CA 的 OV 证书也要求硬件令牌，能导出 `.pfx` 的较少；EV 必须硬件令牌 |
| Azure Trusted Signing | 推荐给 CI | 微软云签名服务，按订阅计费；需要完成组织身份验证，配置 `win.azureSignOptions` |
| SSL.com eSigner 等云签名 | 替代方案 | 通过云端 API 签名，CI 里调用其工具 |

如果没有证书，Windows 安装包仍可正常使用，只是 SmartScreen 提示。

### 2. 仓库里需要改的地方（拿到材料后）

- `.pfx` 方案：`win.signingHashAlgorithms` 保持默认，CI 加
  `CSC_LINK`（`.pfx` 的 base64）、`CSC_KEY_PASSWORD`；
  electron-builder 会自动签名 NSIS 安装包和 exe。
- Azure Trusted Signing：`package.json` → `build.win.azureSignOptions`
  （`publisherName`、`endpoint`、`codeSigningAccountName`、
  `certificateProfileName`），CI 加 Azure 登录（OIDC 或
  `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`）。
- 验证：`signtool verify /pa /v "Arena-Watch-Setup-x.y.z.exe"`。

### 3. 需要你提供

- 若走 `.pfx`：`.pfx` + 密码 + 证书主题名（Subject CN）；
- 若走 Azure Trusted Signing：Azure 订阅/租户、签名账户名、
  证书配置文件（Certificate Profile）名、完成身份验证的组织信息；
- 若走其他云签名：对应服务的账号与 API 凭据。

## 安全约定

- 证书、密码、API Key 只放 GitHub Actions Secrets 或本机钥匙串；
- 不把 `.p12` / `.pfx` / `.p8` 提交进仓库（`.gitignore` 也应覆盖）；
- CI 日志里不要打印 secret；签名失败时先看 electron-builder 的
  `CSC_*` 是否为空，再看证书是否过期。

## 时间与影响

- macOS 公证通常 2–10 分钟；首次配置证书约 1–2 小时（含苹果审核）。
- 签名后 macOS 自动更新才能正常安装；Windows 签名主要消除 SmartScreen 警告。
- 在没有证书之前，Release 会继续发布未签名包，README 里保留安装提示。
