# 英语跟读对比工具（Shadowing Compare）

把英语口语课程里的英文例句切成单句音频，在 iPhone 上逐句「听原音 → 录自己 → 对比」。

| 部分 | 位置 | 状态 |
|---|---|---|
| A. 切句流水线（Python） | `pipeline/` | M2 开始 |
| B. 练习 App（PWA） | `app/` | **M1 完成，待 iPhone 实测** |

> 课程音频和你的录音**只存在本地**：App 是纯静态网页，课程包通过「文件」App 导入，存进手机的 IndexedDB，不上传任何服务器。`data/` 已加入 `.gitignore`。

---

## 目录

```
app/                 练习 PWA（Vite + 原生 TypeScript，依赖只有 jszip、idb）
  src/audio.ts       播放 / 录音（iOS 专项处理都在这里）
  src/db.ts          IndexedDB 存储
  src/importer.ts    课程包导入与合并
  src/views/         页面：课程库 / Day 列表 / 句子列表 / 练习 / 设置
  public/sw.js       Service Worker（构建时自动注入预缓存列表）
tools/
  make_test_pack.py  用 macOS 的 say 生成测试课程包
  make_icons.py      生成 App 图标
pipeline/            切句流水线（M2 起）
data/                本地数据，不入 git
  raw/ work/ packs/
```

## 环境

- Node.js 20.19+（Mac：`brew install node`）
- Python 3.9+、ffmpeg（`brew install ffmpeg`）

## M1：在 iPhone 上跑通练习 App

### 1. 生成测试课程包

```bash
python3 tools/make_test_pack.py
# → data/packs/test-pack.zip（2 天 / 5 句，macOS 合成语音）
```

把这个 zip 用 **AirDrop** 发到 iPhone（选「存储到文件」），或者放进 iCloud Drive。

### 2. 部署到 GitHub Pages（推荐，iPhone 录音必须 HTTPS）

1. 在 GitHub 新建一个仓库（可以是公开仓库，里面不含任何课程音频）。
2. 在本目录执行：
   ```bash
   git add -A && git commit -m "M1: 练习 App 骨架"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
   提交前可以 `git status` 确认没有 `data/`、`.zip`、`.m4a`。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
4. 推送后 Actions 会自动构建（`.github/workflows/deploy.yml`），约 1 分钟后打开
   `https://<你的用户名>.github.io/<仓库名>/`。

以后每次 push 到 main 修改 `app/` 都会自动重新部署。App 会在下次打开时更新（Service Worker）。

### 3. 在 iPhone 上使用

1. 用 **Safari** 打开上面的网址。
2. 点「分享」→「**添加到主屏幕**」，之后**从主屏幕图标打开**。主屏幕 App 的数据不容易被系统清理，也能离线用。
3. 点「导入课程包」→ 在「文件」里选 `test-pack.zip`。
4. 进入 Day 1 → 「开始练习」。

### 本地调试（可选）

```bash
cd app
npm install
npm run dev          # 电脑浏览器调试：http://localhost:5173
npm run dev:https    # 让同一 Wi-Fi 下的 iPhone 访问（自签名证书）
```

`dev:https` 会打印 `https://192.168.x.x:5173`，iPhone Safari 打开后会提示证书不受信任，点「显示详细信息 → 访问此网站」即可，麦克风也能用。

---

## 练习页功能

| 按钮 | 作用 |
|---|---|
| ▶ 原音 | 播放这句原音（再点一次停止） |
| ● 录音 / ■ 停止 | 跟读录音，最长 30 秒自动停止；录音时按钮显示计时 |
| ▶ 我的 | 播放最新一次录音 |
| ⇄ 对比 | 原音 → 停顿 0.4 秒 → 我的录音，连续播放 |
| 0.75× / 1.0× | 原音倍速（不变调） |
| ⭐ 需加强 / ✓ 已掌握 | 标记，在句子列表和 Day 列表里显示 |
| 👁 | 隐藏文本，练纯听辨（点模糊的句子可偷看） |
| ⛶ | 专注模式：一屏一句、按钮放大，适合单手 |

- 底部「上一句 / 下一句」，也可以在卡片上**左右滑动**切句。
- 每句保留最近 3 次录音，可以回听比较。
- 设置页：存储占用、清除录音、导出录音（zip，通过分享面板存到「文件」）。

## M1 验收清单（请在 iPhone 上逐条试）

分别在 **Safari 标签页** 和 **主屏幕 App** 里试：

- [ ] 从「文件」App 导入 `test-pack.zip` 成功；上滑杀掉 App 重开后数据还在
- [ ] 原音、录音、我的、对比四个按钮都正常
- [ ] **静音开关打开时**也能听到原音 / 我的 / 对比
- [ ] 录完立即点「我的」，声音是从**扬声器**出来、音量正常（不是很小声像听筒）
- [ ] 连续练 20 句（可以反复切换几句），麦克风权限不会反复弹出
- [ ] 飞行模式下能打开 App 并练习（需要联网打开过一次）
- [ ] 0.75× 不变调
- [ ] 离开练习页 / 切到后台后，状态栏的录音（橙点）指示消失

如果「录完回放声音很小」：到 **设置 → 录完立即释放麦克风** 打开再试，并告诉我结果。

## 课程包格式

```
<course_id>.zip
├── manifest.json
└── audio/day01_s001.m4a ...
```

`manifest.json` 见 SPEC 2.6。重复导入同一个 `course_id` 会按句子 id 合并：同 id 覆盖、新 id 追加、其它天保留。
