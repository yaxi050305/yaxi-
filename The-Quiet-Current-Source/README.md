# 雾隐深流 · The Quiet Current

在清晨的热带雨林里划一艘小木船，穿过河湾，到右岸有灯的古老码头。

## 本地启动

安装 Node.js 20.19+ 或 22.12+，在项目目录运行：

```sh
npm install
npm run dev
```

打开终端显示的本地地址，默认是 `http://localhost:5173`。浏览器需要支持 WebGL 2。运行 `npm run build` 生成 `dist/`，再运行 `npm run preview` 预览生产构建。

## 操作

- **A / 鼠标左键**划左桨，**D / 鼠标右键**划右桨。点击或按住均可。
- 左右交替向前划。同侧连续划桨会向另一侧转弯，松手后船仍会滑行。
- 移动鼠标观察四周，按 **Esc** 暂停或继续。触屏可拖动场景观察，并按住屏幕下方的桨键。
- 右上角可开关环境音。看到鳄鱼经过时提前松桨，等它游开。船身碰到鳄鱼会结束当前航程。
- 从河道一侧靠近码头灯旁的台阶，船会自动减速并停靠。船停稳后显示航程、用时和划桨次数。

## 可调参数

参数集中在 `src/config.js`。

| 参数 | 作用 |
| --- | --- |
| `BOAT.strokeImpulse`、`strokeInterval`、`maxSpeed` | 每次划桨的推进力、连续划桨间隔（秒）及速度上限 |
| `BOAT.turnImpulse`、`turnDrag` | 单侧划桨的转向力度及转向衰减速度 |
| `BOAT.waterDrag`、`current` | 船的滑行阻力及水流漂移速度 |
| `BOAT.lookSensitivity`、`lookYaw`、`lookPitch` | 鼠标灵敏度、水平和垂直观察范围 |
| `BOAT.dockingSeconds` | 自动靠岸动画的时长（秒） |
| `VISUALS.pixelRatio`、`reflectionSize` | 渲染分辨率倍率上限与水面反射纹理的最大横向分辨率 |
| `VISUALS.fogDensity`、`fogColor`、`sunDirection`、`exposure` | 清晨雾的浓度和颜色、太阳方向、整体曝光 |
| `VISUALS.foliageDensity` | 两岸植物和散布岩石的密度倍率，保持大于零 |

河道和碰撞物分布在 `src/river.js`，船身和物理在 `src/boat.js`，雨林植被、地标、水面与天空分别在 `src/jungle.js`、`src/landmarks.js`、`src/water.js` 和 `src/atmosphere.js`。声音由 `src/audio.js` 中的 Web Audio 合成，模型和材质也在本地生成。
