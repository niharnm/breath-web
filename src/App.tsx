import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MutableRefObject, PointerEvent, RefObject } from "react";
import "./App.css";

export type EmergencyMode = "home" | "cpr" | "choking" | "bleeding" | "unknown";

export type Step = {
  id: string;
  title: string;
  instruction: string;
  helper?: string;
  urgent?: boolean;
};

export type Protocol = {
  mode: Exclude<EmergencyMode, "home">;
  label: string;
  shortLabel: string;
  summary: string;
  overlayMarkers: OverlayMarker[];
  steps: Step[];
};

export type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

type OverlayKey = "cpr-chest" | "choking-back" | "choking-thrust" | "bleeding-pressure";

type OverlayMarker = {
  id: OverlayKey;
  label: string;
  tone: "cpr" | "choking" | "bleeding";
  defaultPosition: Position;
};

type Position = {
  x: number;
  y: number;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

const PROTOCOLS: Record<Exclude<EmergencyMode, "home">, Protocol> = {
  cpr: {
    mode: "cpr",
    label: "Adult/teen CPR",
    shortLabel: "CPR",
    summary: "For an adult or teen who is unresponsive and not breathing normally.",
    overlayMarkers: [
      {
        id: "cpr-chest",
        label: "Push here",
        tone: "cpr",
        defaultPosition: { x: 50, y: 52 },
      },
    ],
    steps: [
      {
        id: "call",
        title: "Call 911",
        instruction: "Call 911 now and put the phone on speaker.",
        helper: "Follow dispatcher instructions over Breath.",
        urgent: true,
      },
      {
        id: "check",
        title: "Check response and breathing",
        instruction: "Check if the person is responsive and breathing normally.",
        helper: "Breath does not diagnose. Use what you see and what the dispatcher tells you.",
      },
      {
        id: "position",
        title: "Lay them flat",
        instruction:
          "If the person is unresponsive and not breathing normally, place them flat on a firm surface.",
      },
      {
        id: "hands",
        title: "Place your hands",
        instruction:
          "Place the heel of one hand in the center of the chest and put your other hand on top.",
      },
      {
        id: "compress",
        title: "Push hard and fast",
        instruction: "Push hard and fast in the center of the chest.",
        helper: "Use the 110 BPM rhythm timer if it helps you keep pace.",
      },
      {
        id: "continue",
        title: "Keep going",
        instruction:
          "Continue until responders take over, an AED is ready, the dispatcher says stop, or the person starts breathing normally.",
      },
    ],
  },
  choking: {
    mode: "choking",
    label: "Choking adult/child over 1",
    shortLabel: "Choking",
    summary: "For an adult or child over 1 who may be choking.",
    overlayMarkers: [
      {
        id: "choking-back",
        label: "Back blows here",
        tone: "choking",
        defaultPosition: { x: 48, y: 38 },
      },
      {
        id: "choking-thrust",
        label: "Thrust here",
        tone: "choking",
        defaultPosition: { x: 50, y: 58 },
      },
    ],
    steps: [
      {
        id: "cough",
        title: "Check if they can cough",
        instruction: "If they can cough, speak, or breathe, encourage coughing and monitor closely.",
        helper: "Do not start back blows or abdominal thrusts if they can cough, speak, or breathe.",
      },
      {
        id: "call",
        title: "Call 911 if airway is blocked",
        instruction: "If they cannot breathe, speak, or cough, call 911 now.",
        helper: "Put the phone on speaker and follow dispatcher instructions over Breath.",
        urgent: true,
      },
      {
        id: "back-blows",
        title: "Guide back blows",
        instruction: "For an adult or child over 1, guide back blows.",
        helper: "Infant choking is not covered in this MVP.",
      },
      {
        id: "thrusts",
        title: "Guide abdominal thrusts",
        instruction: "Then guide abdominal thrusts.",
        helper: "Use this only for an adult or child over 1 who cannot breathe, speak, or cough.",
      },
      {
        id: "unconscious",
        title: "If they become unconscious",
        instruction: "If they become unconscious, switch to CPR guidance.",
        helper: "Breath does not diagnose. Follow dispatcher instructions over Breath.",
      },
    ],
  },
  bleeding: {
    mode: "bleeding",
    label: "Severe bleeding",
    shortLabel: "Bleeding",
    summary: "For severe or uncontrolled bleeding.",
    overlayMarkers: [
      {
        id: "bleeding-pressure",
        label: "Press here",
        tone: "bleeding",
        defaultPosition: { x: 50, y: 52 },
      },
    ],
    steps: [
      {
        id: "call",
        title: "Call 911",
        instruction: "Call 911 for severe or uncontrolled bleeding.",
        helper: "Put the phone on speaker and follow dispatcher instructions over Breath.",
        urgent: true,
      },
      {
        id: "pressure",
        title: "Apply firm pressure",
        instruction: "Apply firm direct pressure to the wound with cloth, gauze, or clothing.",
      },
      {
        id: "layers",
        title: "Add layers if needed",
        instruction: "Do not remove soaked cloth; add more layers on top.",
      },
      {
        id: "hold",
        title: "Keep pressure",
        instruction: "Keep pressure until help arrives.",
      },
      {
        id: "tourniquet",
        title: "Tourniquet only with support",
        instruction:
          "For severe limb bleeding, use a tourniquet only if trained and available, or if directed by an emergency dispatcher.",
        helper: "Do not delay direct pressure while waiting for other supplies.",
      },
    ],
  },
  unknown: {
    mode: "unknown",
    label: "Not sure",
    shortLabel: "Not sure",
    summary: "Start with emergency help, then choose the closest situation.",
    overlayMarkers: [],
    steps: [
      {
        id: "call",
        title: "Call 911",
        instruction: "Call 911 now and put the phone on speaker.",
        helper: "Follow dispatcher instructions over Breath.",
        urgent: true,
      },
      {
        id: "describe",
        title: "Describe what you see",
        instruction:
          "Tell Breath what is happening in plain words, or choose collapsed, choking, or heavy bleeding.",
        helper: "Breath does not diagnose or replace professional medical help.",
      },
    ],
  },
};

const SELECTOR_OPTIONS: Array<{
  mode: Exclude<EmergencyMode, "home">;
  label: string;
  description: string;
  tone: "critical" | "warning" | "info";
}> = [
  {
    mode: "cpr",
    label: "Collapsed / not breathing",
    description: "Adult or teen is unresponsive or not breathing normally.",
    tone: "critical",
  },
  {
    mode: "choking",
    label: "Choking",
    description: "Adult or child over 1 cannot breathe, speak, or cough.",
    tone: "warning",
  },
  {
    mode: "bleeding",
    label: "Heavy bleeding",
    description: "Severe or uncontrolled bleeding needs direct pressure.",
    tone: "critical",
  },
  {
    mode: "unknown",
    label: "Not sure",
    description: "Start with calling 911 and describe what is happening.",
    tone: "info",
  },
];

const INITIAL_OVERLAY_POSITIONS = Object.values(PROTOCOLS).reduce<Record<OverlayKey, Position>>(
  (positions, protocol) => {
    protocol.overlayMarkers.forEach((marker) => {
      positions[marker.id] = marker.defaultPosition;
    });
    return positions;
  },
  {
    "cpr-chest": { x: 50, y: 52 },
    "choking-back": { x: 48, y: 38 },
    "choking-thrust": { x: 50, y: 58 },
    "bleeding-pressure": { x: 50, y: 52 },
  },
);

const CPR_KEYWORDS = ["collapsed", "not breathing", "unresponsive", "no pulse"];
const CHOKING_KEYWORDS = ["choking", "can't breathe", "cant breathe", "food stuck", "throat"];
const BLEEDING_KEYWORDS = ["blood", "bleeding", "wound", "cut", "spurting"];

function classifyEmergency(text: string): Exclude<EmergencyMode, "home"> {
  const normalized = text.toLowerCase();

  if (CPR_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "cpr";
  }

  if (CHOKING_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "choking";
  }

  if (BLEEDING_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "bleeding";
  }

  return "unknown";
}

function stepText(step: Step): string {
  return [step.title, step.instruction, step.helper].filter(Boolean).join(". ");
}

function nextMessageId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function buildModeStartMessage(mode: Exclude<EmergencyMode, "home">): string {
  const protocol = PROTOCOLS[mode];
  const firstStep = protocol.steps[0];
  return `I can guide ${protocol.shortLabel}. ${firstStep.instruction} ${firstStep.helper ?? ""}`.trim();
}

function buildAssistantReply(
  text: string,
  activeMode: Exclude<EmergencyMode, "home">,
): {
  mode: Exclude<EmergencyMode, "home">;
  reply: string;
  stepIndex?: number;
} {
  const normalized = text.toLowerCase();
  const classifiedMode = classifyEmergency(text);

  if (activeMode === "choking" && normalized.includes("unconscious")) {
    return {
      mode: "cpr",
      reply: `${PROTOCOLS.choking.steps[4].instruction} ${buildModeStartMessage("cpr")}`,
      stepIndex: 0,
    };
  }

  if (
    activeMode === "cpr" &&
    (normalized.includes("where") || normalized.includes("press") || normalized.includes("hand"))
  ) {
    return {
      mode: "cpr",
      reply: `${PROTOCOLS.cpr.steps[3].instruction} ${PROTOCOLS.cpr.steps[4].instruction}`,
      stepIndex: 3,
    };
  }

  if (classifiedMode !== "unknown" && classifiedMode !== activeMode) {
    return {
      mode: classifiedMode,
      reply: buildModeStartMessage(classifiedMode),
      stepIndex: 0,
    };
  }

  if (classifiedMode !== "unknown") {
    const protocol = PROTOCOLS[classifiedMode];
    return {
      mode: classifiedMode,
      reply: `${protocol.steps[0].instruction} ${protocol.steps[0].helper ?? ""}`.trim(),
      stepIndex: 0,
    };
  }

  return {
    mode: activeMode,
    reply:
      "I cannot diagnose that. Call 911 now, put the phone on speaker, and choose collapsed, choking, or heavy bleeding if one matches what you see.",
  };
}

function App() {
  const [activeMode, setActiveMode] = useState<EmergencyMode>("home");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text: "Breath uses predefined emergency protocols. Call 911 now and tell me what is happening.",
    },
  ]);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "requesting" | "live" | "failed">(
    "idle",
  );
  const [overlayPositions, setOverlayPositions] =
    useState<Record<OverlayKey, Position>>(INITIAL_OVERLAY_POSITIONS);
  const [rhythmOn, setRhythmOn] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraPanelRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const currentProtocol = activeMode === "home" ? PROTOCOLS.unknown : PROTOCOLS[activeMode];
  const currentStep = currentProtocol.steps[currentStepIndex] ?? currentProtocol.steps[0];
  const speechRecognitionAvailable =
    typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (activeMode === "home") {
      setRhythmOn(false);
      stopCamera();
      return;
    }

    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("failed");
        return;
      }

      try {
        setCameraStatus("requesting");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraStatus("live");
      } catch {
        setCameraStatus("failed");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
    };
  }, [activeMode]);

  useEffect(() => {
    if (!rhythmOn || activeMode !== "cpr") {
      return;
    }

    const interval = window.setInterval(() => {
      playMetronomeTick(audioContextRef);
    }, 60000 / 110);

    return () => window.clearInterval(interval);
  }, [activeMode, rhythmOn]);

  useEffect(() => {
    return () => {
      stopCamera();
      window.speechSynthesis?.cancel();
      recognitionRef.current?.abort();
      audioContextRef.current?.close();
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus("idle");
  }

  function selectMode(mode: Exclude<EmergencyMode, "home">) {
    setActiveMode(mode);
    setCurrentStepIndex(0);
    setRhythmOn(false);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: nextMessageId(),
        role: "assistant",
        text: buildModeStartMessage(mode),
      },
    ]);
  }

  function returnHome() {
    setActiveMode("home");
    setCurrentStepIndex(0);
    setRhythmOn(false);
  }

  function moveStep(direction: -1 | 1) {
    const nextIndex = currentStepIndex + direction;
    setCurrentStepIndex(Math.min(Math.max(nextIndex, 0), currentProtocol.steps.length - 1));
  }

  function goToStep(index: number) {
    setCurrentStepIndex(Math.min(Math.max(index, 0), currentProtocol.steps.length - 1));
  }

  function readCurrentStep() {
    if (!window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(stepText(currentStep));
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleIncomingText(inputValue);
  }

  function handleIncomingText(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    const modeForReply = activeMode === "home" ? "unknown" : activeMode;
    const response = buildAssistantReply(trimmedText, modeForReply);

    setMessages((currentMessages) => [
      ...currentMessages,
      { id: nextMessageId(), role: "user", text: trimmedText },
      { id: nextMessageId(), role: "assistant", text: response.reply },
    ]);

    setInputValue("");

    if (response.mode !== activeMode) {
      setActiveMode(response.mode);
      setRhythmOn(false);
    }

    if (typeof response.stepIndex === "number") {
      setCurrentStepIndex(response.stepIndex);
    } else if (activeMode === "home") {
      setCurrentStepIndex(0);
    }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || isListening) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      handleIncomingText(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function handleOverlayPointerDown(markerId: OverlayKey, event: PointerEvent<HTMLButtonElement>) {
    const panel = cameraPanelRef.current;
    if (!panel) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    updateMarkerPosition(markerId, event.clientX, event.clientY);
  }

  function handleOverlayPointerMove(markerId: OverlayKey, event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    updateMarkerPosition(markerId, event.clientX, event.clientY);
  }

  function updateMarkerPosition(markerId: OverlayKey, clientX: number, clientY: number) {
    const panel = cameraPanelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const x = Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 8), 92);
    const y = Math.min(Math.max(((clientY - rect.top) / rect.height) * 100, 12), 88);

    setOverlayPositions((positions) => ({
      ...positions,
      [markerId]: { x, y },
    }));
  }

  return (
    <main className="app">
      <EmergencyBanner />
      <div className="shell">
        {activeMode === "home" ? (
          <HomeScreen onSelect={selectMode} />
        ) : (
          <EmergencyWorkspace
            cameraPanelRef={cameraPanelRef}
            cameraStatus={cameraStatus}
            currentProtocol={currentProtocol}
            currentStep={currentStep}
            currentStepIndex={currentStepIndex}
            inputValue={inputValue}
            isListening={isListening}
            messages={messages}
            overlayPositions={overlayPositions}
            rhythmOn={rhythmOn}
            speechRecognitionAvailable={speechRecognitionAvailable}
            videoRef={videoRef}
            onBack={returnHome}
            onInputChange={setInputValue}
            onModeSelect={selectMode}
            onMoveStep={moveStep}
            onOverlayPointerDown={handleOverlayPointerDown}
            onOverlayPointerMove={handleOverlayPointerMove}
            onReadStep={readCurrentStep}
            onRhythmToggle={() => setRhythmOn((isOn) => !isOn)}
            onStartListening={startListening}
            onStepSelect={goToStep}
            onSubmit={handleTextSubmit}
          />
        )}
      </div>
    </main>
  );
}

type HomeScreenProps = {
  onSelect: (mode: Exclude<EmergencyMode, "home">) => void;
};

function HomeScreen({ onSelect }: HomeScreenProps) {
  return (
    <section className="home" aria-labelledby="home-title">
      <div className="brand-row">
        <div className="brand" aria-label="Breath">
          <span className="brand-mark" aria-hidden="true" />
          <span>Breath</span>
        </div>
        <span className="status-pill">On-device MVP</span>
      </div>

      <div className="hero">
        <h1 id="home-title">Breath turns panic into guided action.</h1>
        <p>
          Breath gives live first-aid guidance before help arrives, using predefined emergency
          protocols, visual overlays, voice instructions, and a CPR rhythm timer.
        </p>
      </div>

      <div className="selector-grid" aria-label="Choose emergency type">
        {SELECTOR_OPTIONS.map((option) => (
          <button
            className={`emergency-button ${option.tone}`}
            key={option.mode}
            type="button"
            onClick={() => onSelect(option.mode)}
          >
            <span>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </span>
            <span className="button-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>

      <p className="disclaimer">Breath does not diagnose or replace professional medical help.</p>
    </section>
  );
}

type EmergencyWorkspaceProps = {
  cameraPanelRef: RefObject<HTMLDivElement | null>;
  cameraStatus: "idle" | "requesting" | "live" | "failed";
  currentProtocol: Protocol;
  currentStep: Step;
  currentStepIndex: number;
  inputValue: string;
  isListening: boolean;
  messages: Message[];
  overlayPositions: Record<OverlayKey, Position>;
  rhythmOn: boolean;
  speechRecognitionAvailable: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onBack: () => void;
  onInputChange: (value: string) => void;
  onModeSelect: (mode: Exclude<EmergencyMode, "home">) => void;
  onMoveStep: (direction: -1 | 1) => void;
  onOverlayPointerDown: (markerId: OverlayKey, event: PointerEvent<HTMLButtonElement>) => void;
  onOverlayPointerMove: (markerId: OverlayKey, event: PointerEvent<HTMLButtonElement>) => void;
  onReadStep: () => void;
  onRhythmToggle: () => void;
  onStartListening: () => void;
  onStepSelect: (index: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function EmergencyWorkspace({
  cameraPanelRef,
  cameraStatus,
  currentProtocol,
  currentStep,
  currentStepIndex,
  inputValue,
  isListening,
  messages,
  overlayPositions,
  rhythmOn,
  speechRecognitionAvailable,
  videoRef,
  onBack,
  onInputChange,
  onModeSelect,
  onMoveStep,
  onOverlayPointerDown,
  onOverlayPointerMove,
  onReadStep,
  onRhythmToggle,
  onStartListening,
  onStepSelect,
  onSubmit,
}: EmergencyWorkspaceProps) {
  const showCprTimer = currentProtocol.mode === "cpr";
  const cameraStatusLabel = useMemo(() => {
    if (cameraStatus === "live") {
      return "Camera live";
    }
    if (cameraStatus === "requesting") {
      return "Camera request";
    }
    return "Guided mode";
  }, [cameraStatus]);

  return (
    <section className="emergency-workspace" aria-label={`${currentProtocol.label} guidance`}>
      <div className="workspace-header">
        <button className="back-button" type="button" onClick={onBack}>
          Back
        </button>
        <div className="workspace-title">
          <span>{currentProtocol.shortLabel} guidance</span>
          <h2>{currentProtocol.label}</h2>
        </div>
      </div>

      <CameraPanel
        cameraPanelRef={cameraPanelRef}
        cameraStatus={cameraStatus}
        cameraStatusLabel={cameraStatusLabel}
        overlayPositions={overlayPositions}
        protocol={currentProtocol}
        videoRef={videoRef}
        onOverlayPointerDown={onOverlayPointerDown}
        onOverlayPointerMove={onOverlayPointerMove}
      />

      <div className="guidance-grid">
        <ProtocolCard
          currentStep={currentStep}
          currentStepIndex={currentStepIndex}
          protocol={currentProtocol}
          onMoveStep={onMoveStep}
          onReadStep={onReadStep}
          onStepSelect={onStepSelect}
        />

        {showCprTimer ? (
          <MetronomeCard rhythmOn={rhythmOn} onRhythmToggle={onRhythmToggle} />
        ) : null}

        {currentProtocol.mode === "choking" ? (
          <button className="danger-button" type="button" onClick={() => onModeSelect("cpr")}>
            Switch to CPR guidance
          </button>
        ) : null}

        <AssistantCard
          inputValue={inputValue}
          isListening={isListening}
          messages={messages}
          speechRecognitionAvailable={speechRecognitionAvailable}
          onInputChange={onInputChange}
          onStartListening={onStartListening}
          onSubmit={onSubmit}
        />
      </div>
    </section>
  );
}

type CameraPanelProps = {
  cameraPanelRef: RefObject<HTMLDivElement | null>;
  cameraStatus: "idle" | "requesting" | "live" | "failed";
  cameraStatusLabel: string;
  overlayPositions: Record<OverlayKey, Position>;
  protocol: Protocol;
  videoRef: RefObject<HTMLVideoElement | null>;
  onOverlayPointerDown: (markerId: OverlayKey, event: PointerEvent<HTMLButtonElement>) => void;
  onOverlayPointerMove: (markerId: OverlayKey, event: PointerEvent<HTMLButtonElement>) => void;
};

function CameraPanel({
  cameraPanelRef,
  cameraStatus,
  cameraStatusLabel,
  overlayPositions,
  protocol,
  videoRef,
  onOverlayPointerDown,
  onOverlayPointerMove,
}: CameraPanelProps) {
  const isCameraLive = cameraStatus === "live";

  return (
    <div
      className={`camera-panel ${isCameraLive ? "camera-live" : "camera-off"}`}
      ref={cameraPanelRef}
    >
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera view" />
      {!isCameraLive ? (
        <div className="camera-fallback" aria-live="polite">
          <div>
            <strong>{cameraStatus === "requesting" ? "Requesting camera" : "Guided mode"}</strong>
            <span>
              {cameraStatus === "requesting"
                ? "Allow camera access to use visual overlays on the live view."
                : "Camera is unavailable or blocked. Breath still works with guided steps."}
            </span>
          </div>
        </div>
      ) : null}
      <div className="camera-shade" />
      <div className="camera-top">
        <div className="camera-label">
          <strong>{protocol.summary}</strong>
          <span>Drag the marker to match what you see. No body detection is running.</span>
        </div>
        <span className="camera-status">{cameraStatusLabel}</span>
      </div>

      {protocol.overlayMarkers.map((marker) => {
        const position = overlayPositions[marker.id];
        return (
          <button
            aria-label={`Move overlay marker: ${marker.label}`}
            className={`overlay-marker ${marker.tone}`}
            key={marker.id}
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            type="button"
            onPointerDown={(event) => onOverlayPointerDown(marker.id, event)}
            onPointerMove={(event) => onOverlayPointerMove(marker.id, event)}
          >
            {marker.label}
          </button>
        );
      })}

      <div className="drag-hint">Manual overlay only. Move the marker yourself before following steps.</div>
    </div>
  );
}

type ProtocolCardProps = {
  currentStep: Step;
  currentStepIndex: number;
  protocol: Protocol;
  onMoveStep: (direction: -1 | 1) => void;
  onReadStep: () => void;
  onStepSelect: (index: number) => void;
};

function ProtocolCard({
  currentStep,
  currentStepIndex,
  protocol,
  onMoveStep,
  onReadStep,
  onStepSelect,
}: ProtocolCardProps) {
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === protocol.steps.length - 1;

  return (
    <article className="protocol-card">
      <div className="step-kicker">
        <span>
          Step {currentStepIndex + 1} of {protocol.steps.length}
        </span>
        {currentStep.urgent ? <span>Urgent</span> : null}
      </div>
      <h3 className="step-title">{currentStep.title}</h3>
      <p className="step-instruction">{currentStep.instruction}</p>
      {currentStep.helper ? <p className="step-helper">{currentStep.helper}</p> : null}

      <div className="step-dots" aria-label="Protocol steps">
        {protocol.steps.map((step, index) => (
          <button
            aria-label={`Go to ${step.title}`}
            className={`step-dot ${index === currentStepIndex ? "active" : ""}`}
            key={step.id}
            type="button"
            onClick={() => onStepSelect(index)}
          />
        ))}
      </div>

      <div className="step-actions">
        <button className="ghost-button" disabled={isFirstStep} type="button" onClick={() => onMoveStep(-1)}>
          Previous
        </button>
        <button className="primary-button" disabled={isLastStep} type="button" onClick={() => onMoveStep(1)}>
          Next step
        </button>
        <button className="secondary-button" type="button" onClick={onReadStep}>
          Read aloud
        </button>
        <a className="danger-button" href="tel:911">
          Call 911
        </a>
      </div>
    </article>
  );
}

type MetronomeCardProps = {
  rhythmOn: boolean;
  onRhythmToggle: () => void;
};

function MetronomeCard({ rhythmOn, onRhythmToggle }: MetronomeCardProps) {
  return (
    <article className="metronome-card" aria-label="CPR rhythm timer">
      <div className="metronome-header">
        <div>
          <strong>Compression rhythm</strong>
          <span>110 BPM</span>
        </div>
        <div className={`pulse-ring ${rhythmOn ? "running" : ""}`} aria-hidden="true">
          Push
        </div>
      </div>
      <button className={rhythmOn ? "danger-button" : "primary-button"} type="button" onClick={onRhythmToggle}>
        {rhythmOn ? "Pause rhythm" : "Start 110 BPM rhythm"}
      </button>
    </article>
  );
}

type AssistantCardProps = {
  inputValue: string;
  isListening: boolean;
  messages: Message[];
  speechRecognitionAvailable: boolean;
  onInputChange: (value: string) => void;
  onStartListening: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function AssistantCard({
  inputValue,
  isListening,
  messages,
  speechRecognitionAvailable,
  onInputChange,
  onStartListening,
  onSubmit,
}: AssistantCardProps) {
  return (
    <article className="assistant-card" aria-label="Text and voice assistant">
      <div className="assistant-header">
        <div>
          <h3>Tell Breath what is happening</h3>
          <p>Replies are limited to predefined CPR, choking, and bleeding protocol steps.</p>
        </div>
      </div>

      <div className="message-list" aria-live="polite">
        {messages.slice(-6).map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            {message.text}
          </div>
        ))}
      </div>

      <form className="assistant-form" onSubmit={onSubmit}>
        <textarea
          aria-label="Describe the emergency"
          placeholder="Example: he collapsed and is not breathing"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
        />
        <div className={`assistant-form-actions ${speechRecognitionAvailable ? "" : "single"}`}>
          {speechRecognitionAvailable ? (
            <button className="secondary-button" type="button" onClick={onStartListening}>
              {isListening ? "Listening..." : "Talk"}
            </button>
          ) : null}
          <button className="primary-button" type="submit">
            Send
          </button>
        </div>
      </form>
    </article>
  );
}

function EmergencyBanner() {
  return (
    <div className="safety-banner" role="status" aria-live="polite">
      <strong>Call 911 now.</strong>
      <span>Put phone on speaker. Follow dispatcher instructions over Breath.</span>
    </div>
  );
}

function playMetronomeTick(audioContextRef: MutableRefObject<AudioContext | null>) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  const audioContext = audioContextRef.current ?? new AudioContextConstructor();
  audioContextRef.current = audioContext;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.28, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.09);
}

export default App;
