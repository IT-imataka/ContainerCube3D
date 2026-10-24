import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Grid, OrbitControls, Text } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* ダミーデータ                                                         */
/* ------------------------------------------------------------------ */

type ContainerInfo = {
  id: string;
  name: string;
  status: "running" | "exited" | "paused";
  image: string;
  ports: string;
  volumes: string;
  cpu: string;
  memory: string;
  logs: string[];
};

const container: ContainerInfo = {
  id: "c1",
  name: "grazioso-backend",
  status: "running",
  image: "node:20-alpine",
  ports: "3000:3000",
  volumes: "./src:/app/src",
  cpu: "14.2%",
  memory: "128MB",
  logs: [
    "2026-10-24 10:00:01 INFO  Server started on port 3000",
    "2026-10-24 10:15:22 WARN  High latency detected",
    "2026-10-24 10:15:23 ERROR DB Connection timeout",
  ],
};

// RAMバーの分母（ダミーのメモリ上限）
const MEMORY_LIMIT_MB = 512;

/* ------------------------------------------------------------------ */
/* デザイントークン                                                     */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#010403",
  boxFill: "#03130b",
  phosphor: "#3dff9a", // 主テキスト・稼働中
  dim: "#1e6b45", // 補助テキスト・プロンプト
  cyan: "#5fd7ff", // ポート・イメージなどの値
  amber: "#ffb340", // WARN
  red: "#ff4f5e", // ERROR
};

// troika(drei Text)は woff/ttf/otf を読める（woff2不可）
const FONT_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.1.0/latin-400-normal.woff";

const SIZE = 3;
const HALF = SIZE / 2;
const SURFACE = HALF + 0.006; // 面からわずかに浮かせて Z-fighting を回避
const PAD = 0.18;

/* ------------------------------------------------------------------ */
/* 面ごとの共通レイアウト                                                */
/* ------------------------------------------------------------------ */

type FaceKey = "front" | "right" | "left" | "top" | "back" | "bottom";

const FACE_TRANSFORMS: Record<
  FaceKey,
  { position: [number, number, number]; rotation: [number, number, number] }
> = {
  front: { position: [0, 0, SURFACE], rotation: [0, 0, 0] },
  back: { position: [0, 0, -SURFACE], rotation: [0, Math.PI, 0] },
  right: { position: [SURFACE, 0, 0], rotation: [0, Math.PI / 2, 0] },
  left: { position: [-SURFACE, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  top: { position: [0, SURFACE, 0], rotation: [-Math.PI / 2, 0, 0] },
  bottom: { position: [0, -SURFACE, 0], rotation: [Math.PI / 2, 0, 0] },
};

// 各面の見出し = その情報を得るための docker コマンド
const FACE_COMMANDS: Record<FaceKey, string> = {
  front: "$ docker ps",
  right: "$ docker port",
  left: "$ docker inspect -f '{{.Mounts}}'",
  top: "$ docker stats --no-stream",
  back: "$ docker logs --tail 3",
  bottom: "$ docker inspect -f '{{.Id}}'",
};

type MonoProps = {
  children: string;
  position: [number, number, number];
  size?: number;
  color?: string;
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  maxWidth?: number;
};

function Mono({
  children,
  position,
  size = 0.1,
  color = C.phosphor,
  anchorX = "left",
  anchorY = "top",
  maxWidth,
}: MonoProps) {
  return (
    <Text
      font={FONT_URL}
      position={position}
      fontSize={size}
      color={color}
      anchorX={anchorX}
      anchorY={anchorY}
      maxWidth={maxWidth}
      lineHeight={1.35}
      letterSpacing={-0.01}
    >
      {children}
    </Text>
  );
}

function Face({ face, children }: { face: FaceKey; children?: React.ReactNode }) {
  const { position, rotation } = FACE_TRANSFORMS[face];
  return (
    <group position={position} rotation={rotation}>
      <Mono position={[-HALF + PAD, HALF - PAD, 0]} size={0.085} color={C.dim}>
        {FACE_COMMANDS[face]}
      </Mono>
      {/* 見出し下のライン */}
      <mesh position={[0, HALF - PAD - 0.17, 0]}>
        <planeGeometry args={[SIZE - PAD * 2, 0.006]} />
        <meshBasicMaterial color={C.dim} />
      </mesh>
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* 各面の中身                                                           */
/* ------------------------------------------------------------------ */

function StatusIndicator({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
    if (matRef.current) matRef.current.emissiveIntensity = 1.2 + pulse * 1.8;
    if (ref.current) ref.current.scale.setScalar(1 + pulse * 0.08);
  });
  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshStandardMaterial
          ref={matRef}
          color={C.phosphor}
          emissive={C.phosphor}
          toneMapped={false}
        />
      </mesh>
      <pointLight color={C.phosphor} intensity={1.5} distance={1.2} position={[0, 0, 0.2]} />
    </group>
  );
}

function FrontFace({ data }: { data: ContainerInfo }) {
  const running = data.status === "running";
  return (
    <Face face="front">
      <Mono position={[-HALF + PAD, 0.55, 0]} size={0.09} color={C.dim}>
        NAME
      </Mono>
      <Mono position={[-HALF + PAD, 0.4, 0]} size={0.23} maxWidth={SIZE - PAD * 2}>
        {data.name}
      </Mono>
      <StatusIndicator position={[-HALF + PAD + 0.07, -0.25, 0.07]} />
      <Mono
        position={[-HALF + PAD + 0.24, -0.25, 0]}
        size={0.13}
        anchorY="middle"
        color={running ? C.phosphor : C.red}
      >
        {running ? "running" : data.status}
      </Mono>
      <Mono position={[-HALF + PAD, -HALF + PAD + 0.1, 0]} size={0.08} color={C.dim}>
        {`id ${data.id}  ·  drag to inspect other faces`}
      </Mono>
    </Face>
  );
}

function KeyValue({
  y,
  label,
  value,
  color = C.cyan,
}: {
  y: number;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <>
      <Mono position={[-HALF + PAD, y, 0]} size={0.09} color={C.dim}>
        {label}
      </Mono>
      <Mono position={[-HALF + PAD, y - 0.15, 0]} size={0.19} color={color}>
        {value}
      </Mono>
    </>
  );
}

function RightFace({ data }: { data: ContainerInfo }) {
  const [host, ctr] = data.ports.split(":");
  return (
    <Face face="right">
      <KeyValue y={0.75} label="PORT  host → container" value={`${host} → ${ctr}`} />
      <KeyValue y={0.05} label="IMAGE" value={data.image} color={C.phosphor} />
    </Face>
  );
}

function LeftFace({ data }: { data: ContainerInfo }) {
  const [host, ctr] = data.volumes.split(":");
  return (
    <Face face="left">
      <KeyValue y={0.75} label="VOL  host" value={host} />
      <Mono position={[0, 0.2, 0]} size={0.16} color={C.dim} anchorX="center">
        ↓ bind mount
      </Mono>
      <KeyValue y={-0.05} label="VOL  container" value={ctr} color={C.phosphor} />
    </Face>
  );
}

function Meter({ y, label, value, ratio }: { y: number; label: string; value: string; ratio: number }) {
  const width = SIZE - PAD * 2;
  const r = THREE.MathUtils.clamp(ratio, 0, 1);
  const segments = 24;
  const filled = Math.round(r * segments);
  const segW = width / segments;
  return (
    <group>
      <Mono position={[-HALF + PAD, y, 0]} size={0.09} color={C.dim}>
        {label}
      </Mono>
      <Mono position={[HALF - PAD, y + 0.02, 0]} size={0.19} anchorX="right">
        {value}
      </Mono>
      {/* セグメント式メーター（ターミナルの ▮▮▮▯▯ 風） */}
      {Array.from({ length: segments }).map((_, i) => (
        <mesh key={i} position={[-HALF + PAD + segW * i + segW / 2, y - 0.32, 0]}>
          <planeGeometry args={[segW * 0.7, 0.12]} />
          <meshBasicMaterial
            color={i < filled ? C.phosphor : C.dim}
            transparent
            opacity={i < filled ? 1 : 0.35}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function TopFace({ data }: { data: ContainerInfo }) {
  const cpu = parseFloat(data.cpu) / 100;
  const mem = parseFloat(data.memory) / MEMORY_LIMIT_MB;
  return (
    <Face face="top">
      <Meter y={0.75} label="CPU" value={data.cpu} ratio={cpu} />
      <Meter y={0.0} label={`RAM  / ${MEMORY_LIMIT_MB}MB`} value={data.memory} ratio={mem} />
    </Face>
  );
}

const LEVEL_COLOR: Record<string, string> = {
  INFO: C.dim,
  WARN: C.amber,
  ERROR: C.red,
};

function parseLog(line: string) {
  const m = line.match(/^\S+\s+(\S+)\s+(\w+)\s+(.*)$/);
  if (!m) return { time: "", level: "INFO", message: line };
  return { time: m[1], level: m[2], message: m[3] };
}

function BackFace({ data }: { data: ContainerInfo }) {
  const logs = data.logs.map(parseLog);
  return (
    <Face face="back">
      {logs.map((log, i) => {
        const y = 0.85 - i * 0.62;
        const color = LEVEL_COLOR[log.level] ?? C.phosphor;
        return (
          <group key={i}>
            <Mono position={[-HALF + PAD, y, 0]} size={0.09} color={C.dim}>
              {log.time}
            </Mono>
            <Mono position={[-HALF + PAD + 0.62, y, 0]} size={0.09} color={color}>
              {`[${log.level}]`}
            </Mono>
            <Mono
              position={[-HALF + PAD, y - 0.15, 0]}
              size={0.14}
              color={log.level === "INFO" ? "#8fbfa5" : color}
              maxWidth={SIZE - PAD * 2}
            >
              {log.message}
            </Mono>
          </group>
        );
      })}
    </Face>
  );
}

function BottomFace({ data }: { data: ContainerInfo }) {
  return (
    <Face face="bottom">
      <Mono position={[0, 0, 0]} size={0.3} color={C.dim} anchorX="center" anchorY="middle">
        {data.id}
      </Mono>
    </Face>
  );
}

/* ------------------------------------------------------------------ */
/* キューブ本体                                                         */
/* ------------------------------------------------------------------ */

function ContainerCube({ data }: { data: ContainerInfo }) {
  return (
    <group>
      {/* 暗い半透明の箱 */}
      <mesh>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
        <meshStandardMaterial
          color={C.boxFill}
          transparent
          opacity={0.82}
          roughness={0.9}
          metalness={0.1}
          depthWrite={false}
        />
        <Edges color={C.phosphor} threshold={15} />
      </mesh>
      {/* 外側にうっすらもう一枚のワイヤーフレーム */}
      <mesh scale={1.06}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
        <meshBasicMaterial visible={false} />
        <Edges color={C.dim} threshold={15} />
      </mesh>

      <FrontFace data={data} />
      <RightFace data={data} />
      <LeftFace data={data} />
      <TopFace data={data} />
      <BackFace data={data} />
      <BottomFace data={data} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* カメラ：面ボタンで指定面へ球面補間で回り込む                           */
/* ------------------------------------------------------------------ */

const CAMERA_DISTANCE = 7;
const FACE_VIEWS: Record<Exclude<FaceKey, "bottom">, [number, number, number]> = {
  front: [0, 0, CAMERA_DISTANCE],
  right: [CAMERA_DISTANCE, 0, 0],
  back: [0, 0, -CAMERA_DISTANCE],
  left: [-CAMERA_DISTANCE, 0, 0],
  top: [0, CAMERA_DISTANCE, 0.01], // 真上だと OrbitControls がジンバルロックするので微小オフセット
};

function CameraRig({
  target,
  onArrive,
}: {
  target: [number, number, number] | null;
  onArrive: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const cur = useMemo(() => new THREE.Spherical(), []);
  const tgt = useMemo(() => new THREE.Spherical(), []);
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!target) return;
    cur.setFromVector3(camera.position);
    tgt.setFromVector3(v.set(...target));

    // theta は最短方向に回す（箱を突き抜けないよう直線補間ではなく球面上を移動）
    const dTheta = Math.atan2(Math.sin(tgt.theta - cur.theta), Math.cos(tgt.theta - cur.theta));
    const dPhi = tgt.phi - cur.phi;
    const t = 1 - Math.pow(0.003, delta);

    cur.theta += dTheta * t;
    cur.phi += dPhi * t;
    cur.radius += (tgt.radius - cur.radius) * t;
    cur.makeSafe();
    camera.position.setFromSpherical(cur);
    camera.lookAt(0, 0, 0);
    controls?.update();

    if (Math.abs(dTheta) < 0.002 && Math.abs(dPhi) < 0.002) onArrive();
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* ページ全体（Tailwind の HUD フレーム）                                */
/* ------------------------------------------------------------------ */

const FACE_BUTTONS: { key: keyof typeof FACE_VIEWS; label: string; hint: string }[] = [
  { key: "front", label: "status", hint: "正面" },
  { key: "right", label: "ports / image", hint: "右側面" },
  { key: "left", label: "volumes", hint: "左側面" },
  { key: "top", label: "resources", hint: "上面" },
  { key: "back", label: "logs", hint: "背面" },
];

export default function ContainerCube3D() {
  const [autoRotate, setAutoRotate] = useState(true);
  const [target, setTarget] = useState<[number, number, number] | null>(null);
  const [active, setActive] = useState<keyof typeof FACE_VIEWS | null>("front");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    if (mq.matches) setAutoRotate(false);
  }, []);

  const goTo = (key: keyof typeof FACE_VIEWS) => {
    setAutoRotate(false);
    setActive(key);
    setTarget(FACE_VIEWS[key]);
  };

  const errorCount = container.logs.filter((l) => /\bERROR\b/.test(l)).length;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black font-mono text-emerald-300">
      {/* 3D */}
      <Canvas
        camera={{ position: [4.2, 3, 5.6], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        className="absolute inset-0"
      >
        <color attach="background" args={[C.bg]} />
        <fog attach="fog" args={[C.bg, 9, 22]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={0.5} color={C.phosphor} />

        <ContainerCube data={container} />

        <Grid
          position={[0, -HALF - 1, 0]}
          args={[40, 40]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#0d3322"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor={C.dim}
          fadeDistance={20}
          fadeStrength={1.5}
          infiniteGrid
        />

        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={4.5}
          maxDistance={12}
          enableDamping
          dampingFactor={0.08}
          autoRotate={autoRotate && !reducedMotion}
          autoRotateSpeed={0.6}
          onStart={() => {
            // ドラッグ開始でアニメーションと自動回転を止め、操作をユーザーに渡す
            setAutoRotate(false);
            setTarget(null);
            setActive(null);
          }}
        />
        <CameraRig target={target} onArrive={() => setTarget(null)} />
      </Canvas>

      {/* 走査線オーバーレイ */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.28)_0px,rgba(0,0,0,0.28)_1px,transparent_1px,transparent_3px)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_160px_rgba(0,0,0,0.9)]" />

      {/* ヘッダー */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 text-xs sm:p-6">
        <div>
          <p className="text-emerald-700">root@docker-host:~#</p>
          <h1 className="mt-1 text-lg text-emerald-300 sm:text-xl">
            {container.name}
            <span className="ml-2 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-emerald-300 motion-reduce:animate-none" />
          </h1>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right">
          <dt className="text-emerald-700">state</dt>
          <dd className="text-emerald-300">{container.status}</dd>
          <dt className="text-emerald-700">cpu</dt>
          <dd>{container.cpu}</dd>
          <dt className="text-emerald-700">errors</dt>
          <dd className={errorCount > 0 ? "text-red-400" : ""}>{errorCount}</dd>
        </dl>
      </header>

      {/* 面ナビゲーション */}
      <nav
        aria-label="キューブの面を選択"
        className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-2 p-4 sm:bottom-auto sm:left-6 sm:right-auto sm:top-1/2 sm:-translate-y-1/2 sm:flex-col sm:p-0"
      >
        {FACE_BUTTONS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => goTo(f.key)}
            aria-pressed={active === f.key}
            className={[
              "border px-3 py-1.5 text-left text-xs transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
              active === f.key
                ? "border-emerald-300 bg-emerald-300/10 text-emerald-200"
                : "border-emerald-900 bg-black/60 text-emerald-600 hover:border-emerald-600 hover:text-emerald-300",
            ].join(" ")}
          >
            <span className="mr-2 text-emerald-800">{active === f.key ? ">" : " "}</span>
            {f.label}
            <span className="ml-2 text-emerald-800">{f.hint}</span>
          </button>
        ))}
      </nav>

      {/* 操作ヒント */}
      <p className="pointer-events-none absolute bottom-6 right-6 hidden text-xs text-emerald-800 sm:block">
        ドラッグで回転 / ホイールでズーム
      </p>
    </div>
  );
}
