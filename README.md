# 美音跟读（Shadowing Compare）

一个面向中国学习者的美式英语发音 App：**音标 / 句子 / 段落** 三部分，外加离线查词。核心练习方式是逐句「听原音 → 录自己 → 对比」。

| 部分 | 位置 | 状态 |
|---|---|---|
| A. 切句流水线（Python） | `pipeline/` | 把课程音频切成单句课程包（私人使用） |
| B. 练习 App（PWA） | `app/` | 音标、句子（含连读弱读提示）、查词；段落筹备中 |
| C. 内置公开内容生成 | `tools/content/` | 词典、音标、样例句子课，只用可商用的开放资源 |

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
  public/content/     内置公开内容（由 tools/content 生成，进 git）
tools/
  content/           生成内置公开内容（见下方「内置公开内容」）
  make_test_pack.py  用 macOS 的 say 生成测试课程包
  make_icons.py      生成 App 图标
pipeline/            切句流水线（见下方「切句流水线」）
data/                本地数据，不入 git
  raw/ work/ packs/
```

## 环境

- Node.js 20.19+（Mac：`brew install node`）
- Python 3.9+、ffmpeg（`brew install ffmpeg`）

## 切句流水线（Part A）

把每天的课程音频切成单句，打成课程包。每天的课结构是「开篇 → 朗读① → 逐句讲解 → 朗读②」，流水线只取朗读里的句子，讲解不放进课程包。

### 安装（一次性）

```bash
brew install ffmpeg uv
cd pipeline
uv venv --python 3.12 .venv
uv pip install --python .venv -r requirements.txt \
  --index-url https://pypi.tuna.tsinghua.edu.cn/simple   # 国内用清华镜像
```

模型放在 `data/models/`（不入 git）。Hugging Face 在国内下载很慢，从 ModelScope 下：

| 模型 | 用途 | ModelScope 仓库 | 本地目录 |
|---|---|---|---|
| whisper-large-v3（MLX 版，3GB） | 识别 | `mlx-community/whisper-large-v3-mlx` | `data/models/whisper-large-v3-mlx/` |
| wav2vec2-base-960h（378MB） | 英文强制对齐 | `facebook/wav2vec2-base-960h` | `data/models/wav2vec2-base-960h/` |

对齐还需要 NLTK 的 `punkt_tab`：下载 `https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/tokenizers/punkt_tab.zip`，解压到 `pipeline/.venv/nltk_data/tokenizers/`。

### 目录放法

```
data/raw/day01/xxx.m4a        每天一个目录，放原始音频（视频也行）
data/raw/scripts/教材.pdf      可选：有教材时按原文选句，准确得多
```

### 运行

```bash
cd pipeline
.venv/bin/python run_all.py --day 1        # → data/packs/oral-sentences_day01.zip
.venv/bin/python run_all.py --day 1-5      # 多天打成一个包
.venv/bin/python 06_pack.py --day all      # 全部天数打成一个包 → oral-sentences.zip
.venv/bin/python qa_check.py --day 1-18    # 质检
.venv/bin/python run_all.py --day 1 --from 03   # 只重跑第 03 步及以后
```

每一步也可以单独运行，参数都在 `config.yaml`：

| 步骤 | 作用 | 输出（`data/work/dayXX/`） |
|---|---|---|
| `00_script.py` | 解析教材 PDF 的「句子训练篇」，得到每天的句子和中文翻译 | `script.json` |
| `01_extract.py` | 转成 16k（识别用）和 44.1k（切分用）单声道 wav | `asr.wav` `hq.wav` |
| `02_transcribe.py` | Whisper 逐词识别；对「有声音但没识别出来」的空白再补识别一遍 | `transcript.json` `segments.json` |
| `03_select.py` | 找到两个朗读段，每句取一遍；强制对齐 + 按音量修正起止 | `selected.json` |
| `04_cut.py` | 留白、淡入淡出、响度归一（-16 LUFS）、AAC 80kbps | `audio/*.m4a` `cut.json` |
| `06_pack.py` | 打包课程包 | `data/packs/*.zip` |
| `qa_check.py` | 质检：把切好的每句再识别一遍，和原文比对，列出需要人工听的句子 | `qa.json` |

`03_select` 的输出里标「⚠️ 匹配度低」的句子，多半是识别把单词听错了（比如 zip your → zipper），位置通常是对的，听一下确认即可。

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

## 内置公开内容（`tools/content/`）

App 自带的内容都是**可以公开发布、可以商用**的：原创句子、开源语音合成、开放许可的数据。付费课程的音频和文本不进这里，继续走「导入课程包」，只存在自己手机上。

| 内容 | 来源 | 许可 | 脚本 |
|---|---|---|---|
| 查词（约 3.7 万词 + 2.8 万词形） | ECDICT 中文释义 + CMUdict 美音音标 | MIT / BSD | `build_dict.py` |
| 舌位剖面图（26 张） | Richard Wright & Dan McCloy, phonetics-teaching-assets | CC0 | `fetch_sagittal.py` |
| 音标（41 个美音音素） | `phonemes.yaml`（发音要领、例词，手工维护） | 原创 | `build_ipa.py` |
| 样例句子课（5 组 30 句） | `sentences.yaml`（原创句子） | 原创 | `build_sentences.py` |
| 例词、句子音频 | Kokoro-82M 语音合成（`af_heart` 美音女声） | Apache 2.0 | `tts.py` |
| 连读 / 弱读 / 闪音 / 省略提示 | CMUdict + 规则自动标注 | — | `hints.py` |

### 安装（一次性）

```bash
cd tools/content
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -i https://pypi.tuna.tsinghua.edu.cn/simple kokoro-onnx soundfile pyyaml

# 数据和模型放到 data/（不进 git）
mkdir -p ../../data/dict ../../data/models/kokoro
curl -L -o ../../data/dict/ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o ../../data/dict/cmudict.dict https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  curl -L -o ../../data/models/kokoro/$f https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f
done
```

### 生成

```bash
cd tools/content
.venv/bin/python build_dict.py          # → app/public/content/dict/a.json … z.json
.venv/bin/python fetch_sagittal.py      # 下载剖面图到 data/commons/svg
.venv/bin/python build_ipa.py           # → app/public/content/ipa/
.venv/bin/python build_sentences.py     # → app/public/content/sentences/sample.zip
.venv/bin/python hints.py "Put it on the table."   # 单独看某句的自动标注
```

**改内容**：改 `phonemes.yaml`（发音要领、例词）或 `sentences.yaml`（句子），再运行对应脚本。音频已经合成过、文字没变的会复用，加 `--force` 全部重做。

**以后换成自己的录音**：把录好的 m4a 放到 `app/public/content/ipa/audio/<单词>.m4a`，或者 `data/work/sample-sentences/audio/<句子id>.m4a`，覆盖合成的文件即可（脚本不会覆盖已存在的文件）。

**给私人课程补提示**：`hints.py --file data/work/day01/cut.json` 会给每句加上 `hints` 字段，再用流水线打包即可。

## 课程包格式

```
<course_id>.zip
├── manifest.json
└── audio/day01_s001.m4a ...
```

`manifest.json` 见 SPEC 2.6。重复导入同一个 `course_id` 会按句子 id 合并：同 id 覆盖、新 id 追加、其它天保留。

每句可以多一个可选的 `hints` 字段（没有也照常能用）：

```json
"hints": [
  {"type": "link",  "from": 3, "to": 6, "note": "连读：前词结尾的辅音直接接到后词的元音上"},
  {"type": "weak",  "from": 15, "to": 18, "note": "弱读 /ðə/"},
  {"type": "flap",  "from": 10, "to": 11, "note": "闪音：t 夹在元音之间，听起来像轻 d"},
  {"type": "elide", "from": 4, "to": 5, "note": "省略：t 夹在两个辅音之间，通常不发音"}
]
```

`from` / `to` 是英文原文里的字符位置（左闭右开）。`link` 从前一个词的最后一个字母，到后一个词的第一个字母之后。
