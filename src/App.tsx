import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Users,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Search,
  Lock,
  ChevronRight,
  Sparkles,
  Gamepad2,
  Info,
  CalendarDays,
  UserCheck,
  Table
} from "lucide-react";
import {
  TimeRange,
  RoomConfig,
  ScreenType,
  ModeType,
  RoomHistoryItem,
  OverlapSegment,
  DayOverlapData
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

// Helper time functions
function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeToMin(t: string): number {
  const parts = t.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function minToTime(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function formatAMPM(t: string): string {
  if (!t) return "";
  const parts = t.split(":");
  if (parts.length < 2) return t;
  const hour24 = Number(parts[0]);
  const min = Number(parts[1]);
  if (isNaN(hour24) || isNaN(min)) return t;

  const isPM = hour24 >= 12;
  const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = isPM ? "pm" : "am";
  return `${displayHour}:${pad2(min)} ${period}`;
}

function minToTimeAMPM(m: number): string {
  const hour24 = Math.floor(m / 60);
  const min = m % 60;
  const isPM = hour24 >= 12;
  const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = isPM ? "pm" : "am";
  return `${displayHour}:${pad2(min)} ${period}`;
}

function dateLabel(ds: string): string {
  const d = new Date(ds + "T00:00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
}

function getDaysInMonth(year: number, month: number): (Date | null)[] {
  // Use local time zone to avoid shifting
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
}

// Generate secure salt hash for PIN in front-end
async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder().encode("gtf-salt-" + pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function App() {
  // Navigation & Core States
  const [screen, setScreen] = useState<ScreenType>("home");
  const [roomCode, setRoomCode] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [config, setConfig] = useState<RoomConfig | null>(null);
  const [myRanges, setMyRanges] = useState<Record<string, TimeRange[]>>({});
  const [mySelectedDates, setMySelectedDates] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, Record<string, TimeRange[]>>>({});
  const [userSelectedDates, setUserSelectedDates] = useState<Record<string, string[]>>({});
  const [deleteConfirmDate, setDeleteConfirmDate] = useState<string | null>(null);
  
  // Date Editing States in Grid Screen
  const [isEditingDates, setIsEditingDates] = useState<boolean>(false);
  const [editingDatesSet, setEditingDatesSet] = useState<Set<string>>(new Set());
  const [editExtraDate, setEditExtraDate] = useState<string>("");

  // Heatmap View Selection States
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth()); // 0-indexed

  // UI Flow States
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [mode, setMode] = useState<ModeType>("edit");
  const [localHistory, setLocalHistory] = useState<RoomHistoryItem[]>([]);

  // Inputs
  const [createNickInput, setCreateNickInput] = useState<string>("");
  const [createPinInput, setCreatePinInput] = useState<string>("");
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [joinNickInput, setJoinNickInput] = useState<string>("");
  const [joinPinInput, setJoinPinInput] = useState<string>("");
  
  const [findNickInput, setFindNickInput] = useState<string>("");
  const [findPinInput, setFindPinInput] = useState<string>("");
  const [foundRooms, setFoundRooms] = useState<RoomHistoryItem[] | null>(null);
  const [findLoading, setFindLoading] = useState<boolean>(false);

  const [setupSelectedDates, setSetupSelectedDates] = useState<Set<string>>(new Set());
  const [setupExtraDate, setSetupExtraDate] = useState<string>("");

  // Hover status for overlap segments
  const [activeTooltip, setActiveTooltip] = useState<{
    date: string;
    segment: OverlapSegment;
    total: number;
  } | null>(null);

  // Range Editor State
  const [rangeEditor, setRangeEditor] = useState<{
    date: string;
    index: number | null;
    start: string;
    end: string;
  } | null>(null);

  // Flash Toast Message
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((prev) => prev - 1);
    } else {
      setCalendarMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((prev) => prev + 1);
    } else {
      setCalendarMonth((prev) => prev + 1);
    }
  };

  // Load local room history on mount
  useEffect(() => {
    const raw = localStorage.getItem("gtf_room_history");
    if (raw) {
      try {
        setLocalHistory(JSON.parse(raw));
      } catch (e) {
        setLocalHistory([]);
      }
    }

    // Check url hash for invite code
    const hash = window.location.hash.replace("#", "").trim().toUpperCase();
    if (hash && hash.length === 6) {
      setJoinCodeInput(hash);
      showToast(`방 코드 ${hash}가 감지되어 입력란에 채웠어요!`);
    }
  }, []);

  // Synchronize selectedHeatmapDate and calendar selection based on active dates
  useEffect(() => {
    const activeDates = getAllActiveDates();
    if (activeDates && activeDates.length > 0) {
      if (!selectedHeatmapDate || !activeDates.includes(selectedHeatmapDate)) {
        setSelectedHeatmapDate(activeDates[0]);
      }
      const d = new Date(activeDates[0] + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setCalendarYear(d.getFullYear());
        setCalendarMonth(d.getMonth());
      }
    }
  }, [config?.dates, userSelectedDates, responses]);

  // Fetch heatmap/responses data automatically when entering a room
  useEffect(() => {
    if (roomCode) {
      fetchHeatmapData();
    }
  }, [roomCode]);

  // Sync to local history
  const addRoomToLocalHistory = (code: string, cfg: RoomConfig) => {
    const updated = [...localHistory.filter((item) => item.code !== code)];
    updated.unshift({ code, config: cfg });
    const limited = updated.slice(0, 10); // Keep last 10
    setLocalHistory(limited);
    localStorage.setItem("gtf_room_history", JSON.stringify(limited));
  };

  // Pre-fill setup dates with upcoming 7 days
  const initializeSetupDates = () => {
    const today = new Date();
    const datesSet = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getTime() + i * DAY_MS);
      datesSet.add(dateStr(d));
    }
    setSetupSelectedDates(datesSet);
  };

  const handleGoSetup = () => {
    if (!createNickInput.trim()) {
      showToast("닉네임을 먼저 입력해 주세요!");
      return;
    }
    if (!/^\d{4}$/.test(createPinInput.trim())) {
      showToast("PIN 번호는 숫자 4자리로 입력해 주세요!");
      return;
    }
    initializeSetupDates();
    setScreen("setup");
  };

  const toggleSetupDate = (ds: string) => {
    const next = new Set(setupSelectedDates);
    if (next.has(ds)) {
      next.delete(ds);
    } else {
      next.add(ds);
    }
    setSetupSelectedDates(next);
  };

  const handleAddExtraDate = () => {
    if (!setupExtraDate) return;
    const next = new Set(setupSelectedDates);
    next.add(setupExtraDate);
    setSetupSelectedDates(next);
    setSetupExtraDate("");
    showToast(`${dateLabel(setupExtraDate)}가 일정 목록에 추가되었습니다.`);
  };

  const handleCreateRoom = async () => {
    const nick = createNickInput.trim();
    const rawPin = createPinInput.trim();
    if (!nick || !/^\d{4}$/.test(rawPin)) {
      showToast("닉네임과 PIN 4자리를 확인해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const pinHash = await hashPin(rawPin);
      const dates = Array.from(setupSelectedDates).sort();

      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nick, pinHash, dates }),
      });

      const data = await res.json();
      if (data.success) {
        setRoomCode(data.code);
        setNickname(nick);
        setPin(rawPin);
        setConfig(data.config);
        setMyRanges({});
        setMySelectedDates([]);
        addRoomToLocalHistory(data.code, data.config);
        window.location.hash = data.code;
        setScreen("grid");
        setMode("edit");
        showToast("🎮 조율용 방이 완성되었습니다! 친구들에게 코드를 전송하세요.");
      } else {
        showToast(data.error || "방 생성 도중 오류가 발생했습니다.");
      }
    } catch (err) {
      showToast("서버와 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (overrideCode?: string) => {
    const code = (overrideCode || joinCodeInput).trim().toUpperCase();
    const nick = joinNickInput.trim();
    const rawPin = joinPinInput.trim();

    if (!code || code.length !== 6) {
      showToast("6자리 방 코드를 올바르게 입력해 주세요.");
      return;
    }
    if (!nick) {
      showToast("참여할 닉네임을 입력해 주세요.");
      return;
    }
    if (!/^\d{4}$/.test(rawPin)) {
      showToast("비밀번호 분실 방지용 PIN 4자리를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const pinHash = await hashPin(rawPin);
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nick, pinHash }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRoomCode(code);
        setNickname(nick);
        setPin(rawPin);
        setConfig(data.config);
        setMyRanges(data.myRanges || {});
        setMySelectedDates(data.selectedDates || []);
        addRoomToLocalHistory(code, data.config);
        window.location.hash = code;
        setScreen("grid");
        setMode("edit");
        showToast(`${nick}님, 방에 입장하셨습니다!`);
      } else {
        showToast(data.error || "PIN이 일치하지 않거나 참여할 수 없습니다.");
      }
    } catch (err) {
      showToast("서버와의 연결 상태를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleFindRooms = async () => {
    const nick = findNickInput.trim();
    const rawPin = findPinInput.trim();

    if (!nick) {
      showToast("조회할 닉네임을 입력해 주세요.");
      return;
    }
    if (!/^\d{4}$/.test(rawPin)) {
      showToast("등록된 PIN 4자리를 입력해 주세요.");
      return;
    }

    setFindLoading(true);
    try {
      const pinHash = await hashPin(rawPin);
      const res = await fetch("/api/find-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nick, pinHash }),
      });

      const data = await res.json();
      if (data.success) {
        setFoundRooms(data.rooms);
        if (data.rooms.length === 0) {
          showToast("입력한 계정 정보로 조회된 모임이 없습니다.");
        } else {
          showToast(`총 ${data.rooms.length}개의 참여 모임을 찾았습니다!`);
        }
      } else {
        showToast(data.error || "모임을 찾는 중 오류가 생겼습니다.");
      }
    } catch (err) {
      showToast("네트워크 상태를 확인해 주세요.");
    } finally {
      setFindLoading(false);
    }
  };

  // Direct Enter from History List
  const handleEnterFromHistory = async (item: RoomHistoryItem) => {
    // We attempt to find the PIN from matching input, or ask the user
    const nick = prompt("입장할 때 사용한 닉네임을 입력해 주세요:", nickname || "");
    if (!nick) return;
    const rawPin = prompt("PIN 번호 4자리를 입력해 주세요:");
    if (!rawPin || !/^\d{4}$/.test(rawPin)) {
      showToast("올바른 PIN이 아닙니다.");
      return;
    }

    setLoading(true);
    try {
      const pinHash = await hashPin(rawPin);
      const res = await fetch(`/api/rooms/${item.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nick, pinHash }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRoomCode(item.code);
        setNickname(nick);
        setPin(rawPin);
        setConfig(data.config);
        setMyRanges(data.myRanges || {});
        setMySelectedDates(data.selectedDates || []);
        addRoomToLocalHistory(item.code, data.config);
        window.location.hash = item.code;
        setScreen("grid");
        setMode("edit");
        showToast("저장된 일정을 성공적으로 연동했습니다.");
      } else {
        showToast(data.error || "계정 정보가 올바르지 않습니다.");
      }
    } catch (err) {
      showToast("연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  // Update backend with user ranges
  const saveUserRanges = async (updatedRanges: Record<string, TimeRange[]>) => {
    setSaving(true);
    try {
      const pinHash = await hashPin(pin);
      const res = await fetch(`/api/rooms/${roomCode}/user/${nickname}/ranges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinHash, ranges: updatedRanges, selectedDates: mySelectedDates }),
      });

      if (!res.ok) {
        showToast("일정 실시간 저장에 실패했습니다.");
      }
    } catch (e) {
      showToast("일정 저장 중 통신 에러가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // Edit room dates helpers
  const toggleEditRoomDate = (ds: string) => {
    const next = new Set<string>(editingDatesSet);
    if (next.has(ds)) {
      next.delete(ds);
    } else {
      next.add(ds);
      if (!myRanges[ds] || myRanges[ds].length === 0) {
        setMyRanges((prev) => ({
          ...prev,
          [ds]: [{ start: "19:00", end: "22:00" }],
        }));
      }
    }
    setEditingDatesSet(next);
  };

  const handleAddEditRoomExtraDate = () => {
    if (!editExtraDate) return;
    const next = new Set<string>(editingDatesSet);
    next.add(editExtraDate);
    if (!myRanges[editExtraDate] || myRanges[editExtraDate].length === 0) {
      setMyRanges((prev) => ({
        ...prev,
        [editExtraDate]: [{ start: "19:00", end: "22:00" }],
      }));
    }
    setEditingDatesSet(next);
    setEditExtraDate("");
    showToast(`${dateLabel(editExtraDate)}가 수정할 일정 목록에 추가되었습니다.`);
  };

  const handleSaveMySelectedDates = async () => {
    const nextSelectedDates = (Array.from(editingDatesSet) as string[]).sort();

    // Clean myRanges of any dates that were deselected
    const updatedRanges = { ...myRanges };
    Object.keys(updatedRanges).forEach((d) => {
      if (!editingDatesSet.has(d)) {
        delete updatedRanges[d];
      }
    });

    // Enforce that every selected date has at least one time range
    const emptyDates = nextSelectedDates.filter((d) => !updatedRanges[d] || updatedRanges[d].length === 0);
    if (emptyDates.length > 0) {
      showToast(`시간을 선택하지 않은 날짜가 있습니다 (${dateLabel(emptyDates[0])}). 시간을 먼저 추가해 주세요!`);
      return;
    }

    setSaving(true);
    try {
      const pinHash = await hashPin(pin);

      const res = await fetch(`/api/rooms/${roomCode}/user/${nickname}/ranges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinHash,
          ranges: updatedRanges,
          selectedDates: nextSelectedDates,
        }),
      });

      if (res.ok) {
        setMySelectedDates(nextSelectedDates);
        setMyRanges(updatedRanges);
        setIsEditingDates(false);
        showToast("선택하신 날짜 목록이 저장되었습니다!");
        fetchHeatmapData();
      } else {
        showToast("날짜 설정 변경에 실패했습니다.");
      }
    } catch (e) {
      showToast("서버와 통신하는 도중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMySelectedDate = async (ds: string) => {
    if (!config) return;

    const nextSelectedDates = mySelectedDates.filter((d) => d !== ds);

    setSaving(true);
    try {
      const pinHash = await hashPin(pin);
      const updatedRanges = { ...myRanges };
      delete updatedRanges[ds];

      const res = await fetch(`/api/rooms/${roomCode}/user/${nickname}/ranges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinHash,
          ranges: updatedRanges,
          selectedDates: nextSelectedDates,
        }),
      });

      if (res.ok) {
        setMySelectedDates(nextSelectedDates);
        setMyRanges(updatedRanges);
        showToast("선택하신 날짜를 내 목록에서 지웠습니다.");
        fetchHeatmapData();
      } else {
        showToast("날짜 삭제에 실패했습니다.");
      }
    } catch (e) {
      showToast("서버와 통신하는 도중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // Range editor helpers
  const handleOpenAddRange = (date: string) => {
    setRangeEditor({ date, index: null, start: "19:00", end: "22:00" });
  };

  const handleOpenEditRange = (date: string, idx: number) => {
    const current = myRanges[date]?.[idx];
    if (current) {
      setRangeEditor({ date, index: idx, start: current.start, end: current.end });
    }
  };

  const handleSaveRange = async () => {
    if (!rangeEditor) return;
    const { date, index, start, end } = rangeEditor;

    if (!start || !end) {
      showToast("시작 및 종료 시간대를 올바르게 지정해 주세요.");
      return;
    }

    if (timeToMin(end) <= timeToMin(start)) {
      showToast("종료 시간은 반드시 시작 시간보다 나중이어야 합니다!");
      return;
    }

    const currentDayRanges = [...(myRanges[date] || [])];
    const newEntry = { start, end };

    if (index === null) {
      currentDayRanges.push(newEntry);
    } else {
      currentDayRanges[index] = newEntry;
    }

    // Sort ranges ascending by start time
    currentDayRanges.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

    const updated = { ...myRanges, [date]: currentDayRanges };
    setMyRanges(updated);
    setRangeEditor(null);
    if (!isEditingDates) {
      await saveUserRanges(updated);
    }
    showToast("시간대가 업데이트되었습니다.");
  };

  const handleDeleteRange = async (date: string, idx: number) => {
    const currentDayRanges = [...(myRanges[date] || [])];
    if (currentDayRanges.length <= 1) {
      showToast("날짜를 유지하려면 최소 하나의 시간대가 등록되어 있어야 합니다. 날짜 자체를 삭제하려면 '조율 날짜 수정'을 이용해 주세요.");
      return;
    }
    currentDayRanges.splice(idx, 1);

    const updated = { ...myRanges, [date]: currentDayRanges };
    setMyRanges(updated);
    if (!isEditingDates) {
      await saveUserRanges(updated);
    }
    showToast("시간대를 삭제했습니다.");
  };

  // Refresh heatmap/responses
  const fetchHeatmapData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/responses`);
      const data = await res.json();
      if (data.success) {
        setResponses(data.responses || {});
        setUserSelectedDates(data.userSelectedDates || {});
        setConfig(data.config);
        setLastRefresh(new Date());
      } else {
        showToast(data.error || "종합 일정을 가져올 수 없습니다.");
      }
    } catch (e) {
      showToast("데이터 갱신에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchMode = (target: ModeType) => {
    setMode(target);
    if (target === "heatmap") {
      fetchHeatmapData();
    }
  };

  const handleCopyCode = () => {
    try {
      navigator.clipboard.writeText(roomCode);
      showToast(`방 코드를 클립보드에 복사했어요! (${roomCode})`);
    } catch (e) {
      showToast(`복사에 실패했습니다. 코드: ${roomCode}`);
    }
  };

  const handleLeaveRoom = () => {
    setScreen("home");
    setRoomCode("");
    setConfig(null);
    setMyRanges({});
    setResponses({});
    setRangeEditor(null);
    window.location.hash = "";
  };

  const getAllActiveDates = (): string[] => {
    if (!config) return [];
    const datesSet = new Set<string>(config.dates);
    
    // Add any dates that any user has explicitly selected
    Object.keys(userSelectedDates).forEach((user) => {
      const selectedArr = userSelectedDates[user];
      if (selectedArr && Array.isArray(selectedArr)) {
        selectedArr.forEach((d) => datesSet.add(d));
      }
    });

    // Add any dates that are present in any user's responses
    Object.keys(responses).forEach((user) => {
      const userRanges = responses[user];
      if (userRanges) {
        Object.keys(userRanges).forEach((d) => {
          if (userRanges[d] && userRanges[d].length > 0) {
            datesSet.add(d);
          }
        });
      }
    });
    return Array.from(datesSet).sort();
  };

  // Math/overlap computer
  const computeDayOverlap = (date: string): DayOverlapData => {
    const nicks = Object.keys(responses);
    const total = nicks.length;
    
    // Flatten all ranges for this day
    const allRanges: { nick: string; start: number; end: number }[] = [];
    nicks.forEach((n) => {
      const ranges = responses[n]?.[date] || [];
      ranges.forEach((r) => {
        allRanges.push({
          nick: n,
          start: timeToMin(r.start),
          end: timeToMin(r.end),
        });
      });
    });

    if (allRanges.length === 0) {
      return { segments: [], total, min: 0, max: 0 };
    }

    // Collect all unique time boundary points
    const pointsSet = new Set<number>();
    allRanges.forEach((r) => {
      pointsSet.add(r.start);
      pointsSet.add(r.end);
    });

    const sortedPoints = Array.from(pointsSet).sort((a, b) => a - b);
    const segments: OverlapSegment[] = [];

    // Form discrete segments and count overlapping users
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const t0 = sortedPoints[i];
      const t1 = sortedPoints[i + 1];
      if (t1 <= t0) continue;

      // Filter who is covering this slice
      const covering = allRanges.filter((r) => r.start <= t0 && r.end >= t1);
      const names = Array.from(new Set(covering.map((c) => c.nick)));

      if (names.length > 0) {
        segments.push({
          start: t0,
          end: t1,
          count: names.length,
          names,
        });
      }
    }

    // Merge adjacent segments with identical participants
    const merged: OverlapSegment[] = [];
    segments.forEach((s) => {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.count === s.count &&
        last.end === s.start &&
        JSON.stringify(last.names.sort()) === JSON.stringify(s.names.sort())
      ) {
        last.end = s.end;
      } else {
        merged.push({ ...s });
      }
    });

    return {
      segments: merged,
      total,
      min: sortedPoints[0],
      max: sortedPoints[sortedPoints.length - 1],
    };
  };

  // Quick preset selections for setup
  const applyPresetDates = (presetType: "thisWeek" | "thisWeekend" | "nextWeek") => {
    const today = new Date();
    const nextSet = new Set<string>();
    const currentDayOfWeek = today.getDay(); // 0 is Sun, 6 is Sat

    if (presetType === "thisWeek") {
      // Mon to Fri of this week
      for (let i = 1; i <= 5; i++) {
        const diff = i - currentDayOfWeek;
        const d = new Date(today.getTime() + diff * DAY_MS);
        nextSet.add(dateStr(d));
      }
    } else if (presetType === "thisWeekend") {
      // Sat & Sun of this week
      const satDiff = 6 - currentDayOfWeek;
      const sunDiff = 7 - currentDayOfWeek;
      nextSet.add(dateStr(new Date(today.getTime() + satDiff * DAY_MS)));
      nextSet.add(dateStr(new Date(today.getTime() + sunDiff * DAY_MS)));
    } else if (presetType === "nextWeek") {
      // Next Mon to Sun
      const startOfNextWeekDiff = 8 - currentDayOfWeek; // next Monday
      for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() + (startOfNextWeekDiff + i) * DAY_MS);
        nextSet.add(dateStr(d));
      }
    }
    setSetupSelectedDates(nextSet);
    showToast("날짜 간편 선택이 적용되었습니다.");
  };

  return (
    <div className="min-h-screen font-sans flex flex-col justify-between max-w-4xl mx-auto px-4 py-8 md:py-12">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#2B2822] tracking-tight">언제겜해?</h1>
            <p className="text-xs text-[#8C8779] font-medium">우리끼리 제일 편한 게임 시간 찾기</p>
          </div>
        </div>

        {screen === "grid" && (
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#DFD9C6] bg-white hover:bg-[#F7F5EC] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>방 나가기</span>
          </button>
        )}
      </header>

      <main className="flex-grow">
        <AnimatePresence mode="wait">
          {/* SCREEN 1: HOME */}
          {screen === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="grid md:grid-cols-2 gap-6">
                {/* Create Room Block */}
                <div className="bg-white border border-[#ECE7DA] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[#A9700F] font-bold text-xs uppercase tracking-wider mb-4">
                      <Plus className="w-4 h-4" />
                      <span>새 모임 생성하기</span>
                    </div>
                    <p className="text-sm text-[#8C8779] mb-4 leading-relaxed">
                      모임 날짜를 지정하고 방을 개설합니다. 참여한 친구들의 입력을 한눈에 모아볼 수 있습니다.
                    </p>

                    <div className="space-y-3 mb-6">
                      <div>
                        <label className="block text-xs font-semibold text-[#8C8779] mb-1">내 닉네임</label>
                        <input
                          type="text"
                          placeholder="예: 민수"
                          value={createNickInput}
                          onChange={(e) => setCreateNickInput(e.target.value)}
                          className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FFC93C] transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#8C8779] mb-1">
                          수정용 PIN 번호 (숫자 4자리)
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="비밀번호 설정"
                          value={createPinInput}
                          onChange={(e) => setCreatePinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                          className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FFC93C] transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGoSetup}
                    className="w-full bg-[#FFC93C] hover:bg-[#FFBD1F] text-[#2B2822] font-semibold text-sm rounded-xl py-3 border border-[#FFC93C] shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>날짜 정하러 가기</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Join Room Block */}
                <div className="bg-white border border-[#ECE7DA] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[#A9700F] font-bold text-xs uppercase tracking-wider mb-4">
                      <Users className="w-4 h-4" />
                      <span>기존 모임 참여하기</span>
                    </div>
                    <p className="text-sm text-[#8C8779] mb-4 leading-relaxed">
                      공유받은 6자리 방 코드를 입력하고 내 비는 시간대를 등록해 보세요.
                    </p>

                    <div className="space-y-3 mb-6">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="block text-xs font-semibold text-[#8C8779] mb-1">방 코드</label>
                          <input
                            type="text"
                            placeholder="7XQK2M"
                            value={joinCodeInput}
                            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                            className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] font-bold placeholder:font-normal rounded-lg px-3 py-2 text-sm outline-none text-center focus:border-[#FFC93C] transition-all"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-semibold text-[#8C8779] mb-1">내 닉네임</label>
                          <input
                            type="text"
                            placeholder="지난번과 같은 이름이면 정보 연동"
                            value={joinNickInput}
                            onChange={(e) => setJoinNickInput(e.target.value)}
                            className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FFC93C] transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#8C8779] mb-1">
                          PIN 번호 (숫자 4자리)
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="최초 입장 시 앞으로 쓸 PIN 설정"
                          value={joinPinInput}
                          onChange={(e) => setJoinPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                          className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FFC93C] transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleJoinRoom()}
                    disabled={loading}
                    className="w-full bg-white hover:bg-[#F7F5EC] text-[#2B2822] font-semibold text-sm rounded-xl py-3 border border-[#DFD9C6] hover:border-[#FFC93C] shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#DFD9C6] border-t-[#FFC93C]"></span>
                        <span>입장 정보 확인 중...</span>
                      </span>
                    ) : (
                      <span>참여하기</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Find My Rooms & Local History Section */}
              <div className="grid md:grid-cols-3 gap-6 pt-4">
                {/* Account Recovery */}
                <div className="bg-white border border-[#ECE7DA] rounded-2xl p-5 shadow-sm md:col-span-2">
                  <div className="flex items-center gap-2 text-[#A9700F] font-bold text-xs uppercase tracking-wider mb-3">
                    <Search className="w-4 h-4" />
                    <span>참여 중인 방 통합 찾기 (PIN 복구)</span>
                  </div>
                  <p className="text-xs text-[#8C8779] mb-4">
                    닉네임과 PIN 번호만 입력하면, 이전에 만들거나 입장했던 방의 기록을 서버에서 바로 찾아 연동할 수 있습니다.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-[#8C8779] mb-1">사용했던 닉네임</label>
                      <input
                        type="text"
                        placeholder="예: 민수"
                        value={findNickInput}
                        onChange={(e) => setFindNickInput(e.target.value)}
                        className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#FFC93C] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#8C8779] mb-1">등록했던 PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="숫자 4자리"
                        value={findPinInput}
                        onChange={(e) => setFindPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                        className="w-full bg-[#F7F5EC] border border-[#DFD9C6] text-[#2B2822] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#FFC93C] transition-all"
                      />
                    </div>
                    <button
                      onClick={handleFindRooms}
                      disabled={findLoading}
                      className="bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] font-semibold text-xs py-2 rounded-lg text-[#2B2822] transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {findLoading ? (
                        <span className="animate-spin rounded-full h-3 h-3 border-2 border-[#DFD9C6] border-t-[#FFC93C]"></span>
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>내 모임 내역 찾기</span>
                    </button>
                  </div>

                  {foundRooms && foundRooms.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-4 border-t border-[#ECE7DA] pt-4 space-y-2 max-h-48 overflow-y-auto"
                    >
                      <h4 className="text-xs font-bold text-[#2B2822]">찾아낸 모임 목록</h4>
                      {foundRooms.map((r) => (
                        <div
                          key={r.code}
                          onClick={() => handleJoinRoom(r.code)}
                          className="flex justify-between items-center bg-[#F7F5EC] hover:bg-[#FFF6D9] p-2.5 rounded-lg border border-[#DFD9C6] cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#A9700F] font-mono tracking-wide">{r.code}</span>
                            <span className="text-[#8C8779] font-medium">| 개설자: {r.config.createdBy}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[#A9700F] font-semibold">
                            <span>입장하기</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>

                {/* Local History */}
                <div className="bg-white border border-[#ECE7DA] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-[#8C8779] font-bold text-xs uppercase tracking-wider mb-2">
                    <Calendar className="w-4 h-4 text-[#8C8779]" />
                    <span>최근 방문한 모임</span>
                  </div>
                  {localHistory.length === 0 ? (
                    <div className="text-xs text-[#B7B2A0] text-center py-6">
                      방문했던 모임 기록이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {localHistory.map((item) => (
                        <div
                          key={item.code}
                          onClick={() => handleEnterFromHistory(item)}
                          className="group p-2 bg-[#F7F5EC] hover:bg-white rounded-lg border border-[#ECE7DA] hover:border-[#FFC93C] transition-all cursor-pointer flex justify-between items-center text-xs"
                        >
                          <div>
                            <div className="font-bold font-mono tracking-wider text-[#2B2822]">
                              {item.code}
                            </div>
                            <div className="text-[10px] text-[#8C8779] mt-0.5 font-medium truncate max-w-[140px]">
                              개설자: {item.config.createdBy}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#B7B2A0] group-hover:text-[#FFC93C] transition-colors" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* SCREEN 2: SETUP */}
          {screen === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-[#A9700F] uppercase tracking-widest">
                    모임 준비 단계
                  </div>
                  <h2 className="text-xl font-bold text-[#2B2822]">조율할 날짜를 골라주세요</h2>
                </div>
                <button
                  onClick={() => setScreen("home")}
                  className="text-xs text-[#8C8779] hover:text-[#2B2822] font-semibold bg-white border border-[#DFD9C6] px-3 py-1.5 rounded-lg transition-colors"
                >
                  이전 단계로
                </button>
              </div>

              {/* Setup Body */}
              <div className="bg-white border border-[#ECE7DA] rounded-2xl p-6 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-bold text-[#8C8779] mb-2 flex items-center gap-1">
                    <CalendarDays className="w-4 h-4 text-[#A9700F]" />
                    <span>날짜 간편 선택 패널</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => applyPresetDates("thisWeek")}
                      className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] rounded-lg text-xs font-semibold text-[#2B2822] transition-all"
                    >
                      이번주 주중 (월~금)
                    </button>
                    <button
                      onClick={() => applyPresetDates("thisWeekend")}
                      className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] rounded-lg text-xs font-semibold text-[#2B2822] transition-all"
                    >
                      이번주 주말 (토~일)
                    </button>
                    <button
                      onClick={() => applyPresetDates("nextWeek")}
                      className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] rounded-lg text-xs font-semibold text-[#2B2822] transition-all"
                    >
                      다음주 전체 (월~일)
                    </button>
                  </div>
                </div>

                <div className="border-t border-[#ECE7DA] my-4 pt-4">
                  <label className="block text-xs font-bold text-[#8C8779] mb-3">
                    달력에서 직접 추가하거나 아래에서 날짜들을 고르세요 (중복 선택 가능)
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6">
                    {Array.from({ length: 14 }).map((_, i) => {
                      const today = new Date();
                      const d = new Date(today.getTime() + i * DAY_MS);
                      const ds = dateStr(d);
                      const isSelected = setupSelectedDates.has(ds);
                      return (
                        <div
                          key={ds}
                          onClick={() => toggleSetupDate(ds)}
                          className={`p-3 rounded-xl border text-center cursor-pointer select-none transition-all ${
                            isSelected
                              ? "bg-[#FFF3C4] border-[#FFC93C] text-[#A9700F] font-bold"
                              : "bg-[#F7F5EC] border-[#DFD9C6] text-[#2B2822] hover:bg-white"
                          }`}
                        >
                          <div className="text-[10px] text-[#8C8779] font-medium">
                            {d.getMonth() + 1}월
                          </div>
                          <div className="text-base font-bold my-0.5">{d.getDate()}</div>
                          <div className="text-[10px] text-xs font-medium">
                            {WEEKDAY[d.getDay()]}요일
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-[#F7F5EC] p-4 rounded-xl flex flex-col sm:flex-row gap-3 items-end max-w-md border border-[#DFD9C6]">
                    <div className="flex-grow">
                      <label className="block text-xs font-bold text-[#8C8779] mb-1">
                        캘린더에서 직접 날짜 선택
                      </label>
                      <input
                        type="date"
                        value={setupExtraDate}
                        onChange={(e) => setSetupExtraDate(e.target.value)}
                        className="w-full bg-white border border-[#DFD9C6] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#FFC93C] transition-all"
                      />
                    </div>
                    <button
                      onClick={handleAddExtraDate}
                      className="px-4 py-2 bg-white hover:bg-[#FFF6D9] border border-[#DFD9C6] text-[#2B2822] hover:border-[#FFC93C] rounded-lg text-xs font-semibold shrink-0 transition-all"
                    >
                      날짜 추가
                    </button>
                  </div>
                </div>

                <div className="bg-[#FFF6D9] p-4 rounded-xl border border-[#FF7A45]/10 mt-6">
                  <div className="text-xs font-semibold text-[#8A3A18] flex items-center gap-1 mb-1">
                    <Info className="w-4 h-4 text-[#FF7A45]" />
                    <span>선택된 날짜 수: {setupSelectedDates.size}일</span>
                  </div>
                  <p className="text-[11px] text-[#8A3A18]/85 leading-relaxed">
                    선택된 각각의 날짜에 대해 친구들은 자신들의 시작 및 끝나는 가능한 시간대(예: 19:30 ~ 23:00)를 자유롭게 중복 입력하게 됩니다.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="w-full bg-[#FFC93C] hover:bg-[#FFBD1F] text-[#2B2822] font-semibold text-sm rounded-xl py-3.5 border border-[#FFC93C] shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#DFD9C6] border-t-[#FFC93C]"></span>
                    <span>방 만드는 중...</span>
                  </span>
                ) : (
                  <span>방 개설하고 일정 조율판 열기 →</span>
                )}
              </button>
            </motion.div>
          )}

          {/* SCREEN 3: GRID / DASHBOARD */}
          {screen === "grid" && config && (
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Dashboard Sub Header */}
              <div className="bg-white border border-[#ECE7DA] rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-[#A9700F] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>초대하기 · 코드를 복사해서 전송하세요</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-extrabold font-mono tracking-widest text-[#A9700F] bg-[#FFF6D9] px-4 py-1.5 rounded-xl border border-dashed border-[#DFD9C6]">
                        {roomCode}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="p-2.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] text-[#2B2822] rounded-xl transition-all cursor-pointer"
                        title="방 코드 복사"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="text-xs text-[#8C8779] font-medium">현재 접속 계정</div>
                    <div className="text-base font-bold text-[#2B2822] mt-0.5 flex items-center sm:justify-end gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FFC93C] animate-pulse"></span>
                      <span>{nickname}</span>
                      <span className="text-xs text-[#8C8779] font-normal font-mono">(PIN: {pin})</span>
                    </div>
                    <div className="text-[10px] text-[#B7B2A0] mt-1">
                      방 개설일: {new Date(config.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mode Switcher Tabs and Date Editing trigger */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex bg-[#F7F5EC] p-1 rounded-xl w-fit border border-[#DFD9C6]">
                  <button
                    onClick={() => handleSwitchMode("edit")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      mode === "edit"
                        ? "bg-white text-[#2B2822] shadow-sm"
                        : "text-[#8C8779] hover:text-[#2B2822]"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>내 일정 등록 / 관리</span>
                  </button>
                  <button
                    onClick={() => handleSwitchMode("heatmap")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      mode === "heatmap"
                        ? "bg-white text-[#2B2822] shadow-sm"
                        : "text-[#8C8779] hover:text-[#2B2822]"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>모두의 일정</span>
                  </button>
                </div>

                {!isEditingDates && (
                  <button
                    onClick={() => {
                      setEditingDatesSet(new Set(mySelectedDates));
                      setIsEditingDates(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-[#FFF6D9] border border-[#FFC93C]/40 hover:border-[#FFC93C] rounded-xl text-xs font-bold text-[#A9700F] hover:bg-[#FFF3C4] transition-all cursor-pointer"
                  >
                    <Calendar className="w-4 h-4 text-[#FF7A45]" />
                    <span>조율 날짜 수정</span>
                  </button>
                )}
              </div>

              {/* Mode content layout */}
              <AnimatePresence mode="wait">
                {isEditingDates ? (
                  <motion.div
                    key="date-edit"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-white border border-[#FFC93C] rounded-2xl p-6 shadow-sm space-y-6"
                  >
                    <div className="flex items-center justify-between border-b border-[#ECE7DA] pb-3">
                      <div>
                        <h3 className="font-bold text-[#2B2822] text-sm md:text-base">📅 조율할 날짜 수정하기</h3>
                        <p className="text-[11px] text-[#8C8779] mt-0.5">선택한 날짜들이 내 일정 조율 대상 날짜가 됩니다.</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveMySelectedDates}
                          disabled={saving}
                          className="px-3 py-1.5 bg-[#FFC93C] hover:bg-[#FFBD1F] text-[#2B2822] font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                        >
                          {saving ? "저장 중..." : "변경 사항 저장"}
                        </button>
                        <button
                          onClick={() => setIsEditingDates(false)}
                          className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#ECE7DA] border border-[#DFD9C6] text-[#2B2822] text-xs font-semibold rounded-lg transition-all cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    </div>

                    {/* Preset Buttons */}
                    <div>
                      <span className="block text-xs font-bold text-[#8C8779] mb-2">날짜 간편 선택 패널</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const today = new Date();
                            const nextSet = new Set<string>();
                            for (let i = 1; i <= 5; i++) {
                              const diff = i - today.getDay();
                              const d = new Date(today.getTime() + diff * DAY_MS);
                              nextSet.add(dateStr(d));
                            }
                            setEditingDatesSet(nextSet);
                            showToast("주중 날짜가 선택되었습니다.");
                          }}
                          className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] rounded-lg text-xs font-semibold text-[#2B2822] transition-all"
                        >
                          이번주 주중 (월~금)
                        </button>
                        <button
                          onClick={() => {
                            const today = new Date();
                            const nextSet = new Set<string>();
                            const satDiff = 6 - today.getDay();
                            const sunDiff = 7 - today.getDay();
                            nextSet.add(dateStr(new Date(today.getTime() + satDiff * DAY_MS)));
                            nextSet.add(dateStr(new Date(today.getTime() + sunDiff * DAY_MS)));
                            setEditingDatesSet(nextSet);
                            showToast("주말 날짜가 선택되었습니다.");
                          }}
                          className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] rounded-lg text-xs font-semibold text-[#2B2822] transition-all"
                        >
                          이번주 주말 (토~일)
                        </button>
                        <button
                          onClick={() => {
                            const today = new Date();
                            const nextSet = new Set<string>();
                            const startOfNextWeekDiff = 8 - today.getDay();
                            for (let i = 0; i < 7; i++) {
                              const d = new Date(today.getTime() + (startOfNextWeekDiff + i) * DAY_MS);
                              nextSet.add(dateStr(d));
                            }
                            setEditingDatesSet(nextSet);
                            showToast("다음주 전체 날짜가 선택되었습니다.");
                          }}
                          className="px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] rounded-lg text-xs font-semibold text-[#2B2822] transition-all"
                        >
                          다음주 전체 (월~일)
                        </button>
                      </div>
                    </div>

                    {/* Grid Date Toggles */}
                    <div>
                      <label className="block text-xs font-bold text-[#8C8779] mb-3">
                        달력에서 직접 추가하거나 아래에서 날짜들을 고르세요 (중복 선택 가능)
                      </label>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-4">
                        {Array.from({ length: 14 }).map((_, i) => {
                          const today = new Date();
                          const d = new Date(today.getTime() + i * DAY_MS);
                          const ds = dateStr(d);
                          const isSelected = editingDatesSet.has(ds);
                          return (
                            <div
                              key={ds}
                              onClick={() => toggleEditRoomDate(ds)}
                              className={`p-3 rounded-xl border text-center cursor-pointer select-none transition-all ${
                                isSelected
                                  ? "bg-[#FFF3C4] border-[#FFC93C] text-[#A9700F] font-bold"
                                  : "bg-[#F7F5EC] border-[#DFD9C6] text-[#2B2822] hover:bg-white"
                              }`}
                            >
                              <div className="text-[10px] text-[#8C8779] font-medium">
                                {d.getMonth() + 1}월
                              </div>
                              <div className="text-base font-bold my-0.5">{d.getDate()}</div>
                              <div className="text-[10px] text-xs font-medium">
                                {WEEKDAY[d.getDay()]}요일
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-[#F7F5EC] p-4 rounded-xl flex flex-col sm:flex-row gap-3 items-end max-w-md border border-[#DFD9C6]">
                        <div className="flex-grow">
                          <label className="block text-xs font-bold text-[#8C8779] mb-1">
                            캘린더에서 직접 날짜 선택
                          </label>
                          <input
                            type="date"
                            value={editExtraDate}
                            onChange={(e) => setEditExtraDate(e.target.value)}
                            className="w-full bg-white border border-[#DFD9C6] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#FFC93C] transition-all"
                          />
                        </div>
                        <button
                          onClick={handleAddEditRoomExtraDate}
                          className="px-4 py-2 bg-white hover:bg-[#FFF6D9] border border-[#DFD9C6] text-[#2B2822] hover:border-[#FFC93C] rounded-lg text-xs font-semibold shrink-0 transition-all"
                        >
                          날짜 추가
                        </button>
                      </div>
                    </div>

                    {/* Time selection for currently selected dates */}
                    {editingDatesSet.size > 0 && (
                      <div className="border-t border-[#ECE7DA] pt-6 space-y-4">
                        <div>
                          <h4 className="font-bold text-[#2B2822] text-sm md:text-base flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-[#FF7A45]" />
                            <span>🕒 선택한 날짜별 시간 조율</span>
                          </h4>
                          <p className="text-[11px] text-[#8C8779] mt-0.5">선택한 날짜별로 가능한 시간대를 바로 지정하세요. (저장 시 반영됩니다)</p>
                        </div>

                        <div className="space-y-4">
                          {(Array.from(editingDatesSet) as string[]).sort().map((ds) => {
                            const ranges = myRanges[ds] || [];
                            const isEditorOpenForThisDate =
                              rangeEditor && rangeEditor.date === ds && rangeEditor.index === null;

                            return (
                              <div
                                key={ds}
                                className="bg-[#FDFDFB] border border-[#ECE7DA] rounded-xl p-4 space-y-3 hover:border-[#DFD9C6] transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-[#A9700F]" />
                                    <h5 className="font-bold text-[#2B2822] text-xs md:text-sm">
                                      {dateLabel(ds)}
                                    </h5>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleOpenAddRange(ds)}
                                      className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] text-[11px] font-bold text-[#2B2822] rounded-md transition-all cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>시간 추가</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Render ranges list for this date */}
                                <div className="space-y-1.5">
                                  {ranges.length === 0 && !isEditorOpenForThisDate ? (
                                    <div className="text-[11px] text-[#B7B2A0] italic">
                                      아직 가능한 시간대를 등록하지 않았습니다. 우측 추가 버튼을 눌러보세요!
                                    </div>
                                  ) : (
                                    ranges.map((r, idx) => {
                                      const isEditingThisIdx =
                                        rangeEditor &&
                                        rangeEditor.date === ds &&
                                        rangeEditor.index === idx;

                                      if (isEditingThisIdx && rangeEditor) {
                                        return (
                                          <div
                                            key={idx}
                                            className="bg-[#FFF6D9] border border-dashed border-[#FFC93C] p-3 rounded-lg flex flex-wrap gap-2 items-end text-xs"
                                          >
                                            <div className="space-y-1">
                                              <span className="block text-[9px] font-bold text-[#8C8779]">
                                                시작
                                              </span>
                                              <input
                                                type="time"
                                                value={rangeEditor.start}
                                                onChange={(e) =>
                                                  setRangeEditor({ ...rangeEditor, start: e.target.value })
                                                }
                                                className="bg-white border border-[#DFD9C6] rounded px-1.5 py-0.5 text-xs outline-none"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <span className="block text-[9px] font-bold text-[#8C8779]">
                                                종료
                                              </span>
                                              <input
                                                type="time"
                                                value={rangeEditor.end}
                                                onChange={(e) =>
                                                  setRangeEditor({ ...rangeEditor, end: e.target.value })
                                                }
                                                className="bg-white border border-[#DFD9C6] rounded px-1.5 py-0.5 text-xs outline-none"
                                              />
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setRangeEditor({ ...rangeEditor, start: "00:00", end: "23:59" })
                                                }
                                                className="px-2 py-1 bg-[#FFF3C4] border border-[#FFC93C] text-[10px] font-semibold rounded hover:bg-[#FFC93C]/50 text-[#A9700F]"
                                              >
                                                하루종일
                                              </button>
                                              <button
                                                onClick={handleSaveRange}
                                                className="px-2 py-1 bg-[#FFC93C] text-[10px] font-semibold rounded hover:bg-[#FFBD1F]"
                                              >
                                                적용
                                              </button>
                                              <button
                                                onClick={() => setRangeEditor(null)}
                                                className="px-2 py-1 bg-white border border-[#DFD9C6] text-[10px] font-semibold rounded hover:bg-gray-50"
                                              >
                                                취소
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between bg-[#F7F5EC] px-3 py-1.5 rounded-lg border border-[#ECE7DA]"
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <Clock className="w-3 h-3 text-[#8C8779]" />
                                            <span className="text-xs font-bold font-mono text-[#2B2822]">
                                              {formatAMPM(r.start)} ~ {formatAMPM(r.end)}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => handleOpenEditRange(ds, idx)}
                                              className="p-1 text-gray-500 hover:text-gray-900 hover:bg-white rounded transition-colors"
                                              title="시간 수정"
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteRange(ds, idx)}
                                              className="p-1 text-red-500 hover:text-red-700 hover:bg-[#FDECEC] rounded transition-colors"
                                              title="삭제"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}

                                  {/* Inline range creator for this date */}
                                  {isEditorOpenForThisDate && rangeEditor && (
                                    <div className="bg-[#FFF6D9] border border-dashed border-[#FFC93C] p-3 rounded-lg flex flex-wrap gap-2 items-end text-xs">
                                      <div className="space-y-1">
                                        <span className="block text-[9px] font-bold text-[#8C8779]">
                                          시작
                                        </span>
                                        <input
                                          type="time"
                                          value={rangeEditor.start}
                                          onChange={(e) =>
                                            setRangeEditor({ ...rangeEditor, start: e.target.value })
                                          }
                                          className="bg-white border border-[#DFD9C6] rounded px-1.5 py-0.5 text-xs outline-none"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <span className="block text-[9px] font-bold text-[#8C8779]">
                                          종료
                                        </span>
                                        <input
                                          type="time"
                                          value={rangeEditor.end}
                                          onChange={(e) =>
                                            setRangeEditor({ ...rangeEditor, end: e.target.value })
                                          }
                                          className="bg-white border border-[#DFD9C6] rounded px-1.5 py-0.5 text-xs outline-none"
                                        />
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setRangeEditor({ ...rangeEditor, start: "00:00", end: "23:59" })
                                          }
                                          className="px-2 py-1 bg-[#FFF3C4] border border-[#FFC93C] text-[10px] font-semibold rounded hover:bg-[#FFC93C]/50 text-[#A9700F]"
                                        >
                                          하루종일
                                        </button>
                                        <button
                                          onClick={handleSaveRange}
                                          className="px-2 py-1 bg-[#FFC93C] text-[10px] font-semibold rounded hover:bg-[#FFBD1F]"
                                        >
                                          적용
                                        </button>
                                        <button
                                          onClick={() => setRangeEditor(null)}
                                          className="px-2 py-1 bg-white border border-[#DFD9C6] text-[10px] font-semibold rounded hover:bg-gray-50"
                                        >
                                          취소
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Summary info removed as requested */}
                  </motion.div>
                ) : mode === "edit" ? (
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-[#8C8779] font-semibold">
                        날짜마다 비어있는 시간대를 여러 개 지정하여 등록할 수 있습니다.
                      </p>
                      {saving && (
                        <span className="text-xs text-[#8C8779] font-mono">
                          🔄 실시간 동기화 중...
                        </span>
                      )}
                    </div>

                    {mySelectedDates.map((ds) => {
                      const ranges = myRanges[ds] || [];
                      const isEditorOpenForThisDate =
                        rangeEditor && rangeEditor.date === ds && rangeEditor.index === null;

                      return (
                        <div
                          key={ds}
                          className="bg-white border border-[#ECE7DA] rounded-2xl p-5 shadow-sm space-y-4 hover:border-[#DFD9C6] transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-[#A9700F]" />
                              <h3 className="font-bold text-[#2B2822] text-sm md:text-base">
                                {dateLabel(ds)}
                              </h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenAddRange(ds)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F5EC] hover:bg-[#FFF6D9] border border-[#DFD9C6] hover:border-[#FFC93C] text-xs font-bold text-[#2B2822] rounded-lg transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>시간 추가</span>
                              </button>
                              <button
                                onClick={() => setDeleteConfirmDate(ds)}
                                className="flex items-center justify-center p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 text-red-600 rounded-lg transition-all cursor-pointer"
                                title="날짜 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Render ranges lists */}
                          <div className="space-y-2">
                            {ranges.length === 0 && !isEditorOpenForThisDate ? (
                              <div className="text-xs text-[#B7B2A0] italic py-2">
                                아직 가능한 시간대를 등록하지 않았습니다. 우측 추가 버튼을 눌러보세요!
                              </div>
                            ) : (
                              ranges.map((r, idx) => {
                                const isEditingThisIdx =
                                  rangeEditor &&
                                  rangeEditor.date === ds &&
                                  rangeEditor.index === idx;

                                if (isEditingThisIdx && rangeEditor) {
                                  return (
                                    <div
                                      key={idx}
                                      className="bg-[#FFF6D9] border border-dashed border-[#FFC93C] p-4 rounded-xl flex flex-wrap gap-4 items-end"
                                    >
                                      <div className="space-y-1">
                                        <span className="block text-[10px] font-bold text-[#8C8779]">
                                          시작 시간
                                        </span>
                                        <input
                                          type="time"
                                          value={rangeEditor.start}
                                          onChange={(e) =>
                                            setRangeEditor({ ...rangeEditor, start: e.target.value })
                                          }
                                          className="bg-white border border-[#DFD9C6] rounded-lg px-2.5 py-1 text-sm outline-none"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <span className="block text-[10px] font-bold text-[#8C8779]">
                                          종료 시간
                                        </span>
                                        <input
                                          type="time"
                                          value={rangeEditor.end}
                                          onChange={(e) =>
                                            setRangeEditor({ ...rangeEditor, end: e.target.value })
                                          }
                                          className="bg-white border border-[#DFD9C6] rounded-lg px-2.5 py-1 text-sm outline-none"
                                        />
                                      </div>
                                      <div className="flex gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setRangeEditor({ ...rangeEditor, start: "00:00", end: "23:59" })
                                          }
                                          className="px-3 py-1.5 bg-[#FFF3C4] border border-[#FFC93C] text-xs font-semibold rounded-lg hover:bg-[#FFC93C]/50 text-[#A9700F] transition-all"
                                        >
                                          하루종일
                                        </button>
                                        <button
                                          onClick={handleSaveRange}
                                          className="px-3 py-1.5 bg-[#FFC93C] text-xs font-semibold rounded-lg hover:bg-[#FFBD1F]"
                                        >
                                          적용
                                        </button>
                                        <button
                                          onClick={() => setRangeEditor(null)}
                                          className="px-3 py-1.5 bg-white border border-[#DFD9C6] text-xs font-semibold rounded-lg hover:bg-gray-50"
                                        >
                                          취소
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between bg-[#F7F5EC] p-3 rounded-xl border border-[#ECE7DA]"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 text-[#8C8779]" />
                                      <span className="text-sm font-bold font-mono text-[#2B2822]">
                                        {formatAMPM(r.start)} ~ {formatAMPM(r.end)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleOpenEditRange(ds, idx)}
                                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-[#DFD9C6]"
                                        title="시간 수정"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRange(ds, idx)}
                                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-[#FDECEC] rounded-lg transition-colors border border-transparent hover:border-red-200"
                                        title="삭제"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}

                            {/* Range editor inline creator */}
                            {isEditorOpenForThisDate && rangeEditor && (
                              <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-[#FFF6D9] border border-dashed border-[#FFC93C] p-4 rounded-xl flex flex-wrap gap-4 items-end"
                              >
                                <div className="space-y-1">
                                  <span className="block text-[10px] font-bold text-[#8C8779]">
                                    시작 시간
                                  </span>
                                  <input
                                    type="time"
                                    value={rangeEditor.start}
                                    onChange={(e) =>
                                      setRangeEditor({ ...rangeEditor, start: e.target.value })
                                    }
                                    className="bg-white border border-[#DFD9C6] rounded-lg px-2.5 py-1 text-sm outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="block text-[10px] font-bold text-[#8C8779]">
                                    종료 시간
                                  </span>
                                  <input
                                    type="time"
                                    value={rangeEditor.end}
                                    onChange={(e) =>
                                      setRangeEditor({ ...rangeEditor, end: e.target.value })
                                    }
                                    className="bg-white border border-[#DFD9C6] rounded-lg px-2.5 py-1 text-sm outline-none"
                                  />
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRangeEditor({ ...rangeEditor, start: "00:00", end: "23:59" })
                                    }
                                    className="px-3 py-1.5 bg-[#FFF3C4] border border-[#FFC93C] text-xs font-semibold rounded-lg hover:bg-[#FFC93C]/50 text-[#A9700F] transition-all"
                                  >
                                    하루종일
                                  </button>
                                  <button
                                    onClick={handleSaveRange}
                                    className="px-3 py-1.5 bg-[#FFC93C] text-xs font-semibold rounded-lg hover:bg-[#FFBD1F]"
                                  >
                                    추가
                                  </button>
                                  <button
                                    onClick={() => setRangeEditor(null)}
                                    className="px-3 py-1.5 bg-white border border-[#DFD9C6] text-xs font-semibold rounded-lg hover:bg-gray-50"
                                  >
                                    취소
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="heatmap"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      {/* Swatch legend */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#8C8779]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-sm bg-[#FFC93C]/20 border border-[#FFC93C]/30"></span>
                          <span>일부 참여 가능</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-sm bg-[#FFC93C]/70 border border-[#FFC93C]/80"></span>
                          <span>대부분 가능</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-sm bg-[#FFC93C] border-2 border-[#FF7A45]"></span>
                          <span>전원 가능! 🔥</span>
                        </div>
                      </div>

                      <button
                        onClick={fetchHeatmapData}
                        disabled={loading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-[#F7F5EC] border border-[#DFD9C6] rounded-lg text-xs font-semibold text-[#2B2822] transition-all cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span>시간표 새로고침</span>
                      </button>
                    </div>

                    {/* Interactive Calendar View */}
                    <div className="grid md:grid-cols-5 gap-6">
                      {/* Calendar Panel */}
                      <div className="bg-white border border-[#ECE7DA] rounded-2xl p-5 shadow-sm space-y-4 md:col-span-3">
                        <div className="flex items-center justify-between pb-2 border-b border-[#ECE7DA]">
                          <span className="text-xs font-bold text-[#8C8779] flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-[#A9700F]" />
                            <span>조율 캘린더 (날짜 선택)</span>
                          </span>
                          <span className="text-[10px] text-gray-400">● 주황 표시: 조율 중인 날짜</span>
                        </div>

                        {/* Month Navigation */}
                        <div className="flex items-center justify-between bg-[#F7F5EC] p-2 rounded-xl border border-[#DFD9C6]">
                          <button
                            onClick={handlePrevMonth}
                            className="px-2.5 py-1 hover:bg-white rounded-lg border border-transparent hover:border-[#DFD9C6] text-xs font-bold transition-all cursor-pointer"
                          >
                            &lt; 이전 달
                          </button>
                          <div className="text-xs font-extrabold text-[#2B2822]">
                            {calendarYear}년 {calendarMonth + 1}월
                          </div>
                          <button
                            onClick={handleNextMonth}
                            className="px-2.5 py-1 hover:bg-white rounded-lg border border-transparent hover:border-[#DFD9C6] text-xs font-bold transition-all cursor-pointer"
                          >
                            다음 달 &gt;
                          </button>
                        </div>

                        {/* Calendar Grid */}
                        <div className="p-1 border border-[#ECE7DA] rounded-xl bg-gray-50/50">
                          {/* Weekdays */}
                          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-[#8C8779] border-b border-[#ECE7DA] pb-1.5 pt-0.5">
                            <div className="text-red-500">일</div>
                            <div>월</div>
                            <div>화</div>
                            <div>수</div>
                            <div>목</div>
                            <div>금</div>
                            <div className="text-blue-500">토</div>
                          </div>

                          {/* Days */}
                          <div className="grid grid-cols-7 gap-1.5 pt-1.5">
                            {getDaysInMonth(calendarYear, calendarMonth).map((d, index) => {
                              if (d === null) {
                                return <div key={`empty-${index}`} className="aspect-square" />;
                              }
                              const ds = dateStr(d);
                              const activeDates = getAllActiveDates();
                              const isConfiguredDate = activeDates.includes(ds);
                              const isActiveSelected = (selectedHeatmapDate && activeDates.includes(selectedHeatmapDate) ? selectedHeatmapDate : activeDates[0]) === ds;
                              
                              let cellClass = "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium border transition-all text-gray-300 border-transparent bg-transparent select-none";
                              
                              if (isConfiguredDate) {
                                if (isActiveSelected) {
                                  cellClass = "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-extrabold bg-[#FFC93C] text-[#2B2822] border-[#FF7A45] shadow-sm ring-2 ring-[#FF7A45]/20 cursor-pointer";
                                } else {
                                  cellClass = "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-bold bg-[#FFF9E6] text-[#A9700F] border-[#FFC93C]/60 hover:bg-[#FFF3C4] hover:border-[#FFC93C] cursor-pointer";
                                }
                              } else {
                                const isToday = ds === dateStr(new Date());
                                cellClass = "aspect-square flex flex-col items-center justify-center rounded-lg text-[11px] text-gray-400 opacity-40 cursor-not-allowed";
                                if (isToday) {
                                  cellClass += " border border-dashed border-[#DFD9C6] font-semibold opacity-70";
                                }
                              }

                              const availableUsersForDay = Object.keys(responses).filter((user) => {
                                const userRanges = responses[user]?.[ds] || [];
                                return userRanges.length > 0;
                              });
                              const countForDay = availableUsersForDay.length;

                              return (
                                <button
                                  key={ds}
                                  disabled={!isConfiguredDate}
                                  onClick={() => isConfiguredDate && setSelectedHeatmapDate(ds)}
                                  className={cellClass}
                                >
                                  <span>{d.getDate()}</span>
                                  {isConfiguredDate && (
                                    <div className="flex flex-wrap justify-center gap-0.5 mt-1 px-1 max-w-full">
                                      {countForDay > 0 ? (
                                        Array.from({ length: countForDay }).map((_, dotIdx) => (
                                          <span
                                            key={dotIdx}
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              isActiveSelected ? "bg-emerald-800" : "bg-emerald-500"
                                            }`}
                                          />
                                        ))
                                      ) : (
                                        <span className={`w-1.5 h-1.5 rounded-full ${isActiveSelected ? "bg-[#FF7A45]" : "bg-[#FF7A45]/80"}`} />
                                      )}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Quick Select Panel */}
                      <div className="md:col-span-2 flex flex-col justify-between">
                        <div className="bg-[#F7F5EC] p-4 rounded-2xl border border-[#DFD9C6] space-y-3 h-full">
                          <div className="text-xs font-bold text-[#8C8779] flex items-center gap-1 border-b border-[#ECE7DA] pb-2">
                            <CalendarDays className="w-4 h-4 text-[#A9700F]" />
                            <span>조율 일정 목록에서 바로 고르기</span>
                          </div>
                          <p className="text-[11px] text-[#8C8779] leading-relaxed">
                            친구들이 등록한 약속 대상 날짜들입니다. 클릭하면 해당 날짜에 선택되어 있는 가능한 시간대와 상세 참여자를 볼 수 있습니다.
                          </p>
                          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                            {getAllActiveDates().map((ds) => {
                              const activeDates = getAllActiveDates();
                              const isActiveSelected = (selectedHeatmapDate && activeDates.includes(selectedHeatmapDate) ? selectedHeatmapDate : activeDates[0]) === ds;
                              const dailyOverlap = computeDayOverlap(ds);
                              const bestRangesCount = dailyOverlap.segments.filter((s) => s.count === dailyOverlap.total).length;

                              return (
                                <button
                                  key={ds}
                                  onClick={() => setSelectedHeatmapDate(ds)}
                                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex justify-between items-center ${
                                    isActiveSelected
                                      ? "bg-[#FFF3C4] border-[#FFC93C] text-[#A9700F] font-bold shadow-sm"
                                      : "bg-white hover:bg-[#FFF9E6] border-[#DFD9C6] text-[#2B2822]"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span>{dateLabel(ds)}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {bestRangesCount > 0 && (
                                      <span className="bg-[#FF7A45] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                                        합의 가능 🔥
                                      </span>
                                    )}
                                    <span className="text-[10px] text-gray-500">
                                      {Object.keys(responses).filter(user => responses[user]?.[ds]?.length > 0).length}명 가능
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline & Participant Details for Selected Date */}
                    {(() => {
                      const activeDates = getAllActiveDates();
                      const activeSelectedDate = (selectedHeatmapDate && activeDates.includes(selectedHeatmapDate))
                        ? selectedHeatmapDate
                        : activeDates[0] || null;

                      if (!activeSelectedDate) {
                        return (
                          <div className="bg-white border border-[#ECE7DA] rounded-2xl p-6 text-center text-xs text-gray-400 italic">
                            조율 중인 날짜가 없습니다. 날짜를 먼저 추가해 주세요.
                          </div>
                        );
                      }

                      const overlapData = computeDayOverlap(activeSelectedDate);
                      const hasParticipants = overlapData.total > 0;
                      const segments = overlapData.segments;

                      // Compute overlapping segments (where count > 1, or count >= 1 if only 1 user total)
                      const overlappingSegments = [...segments]
                        .filter((seg) => {
                          return overlapData.total <= 1 ? seg.count >= 1 : seg.count > 1;
                        })
                        .sort((a, b) => {
                          if (b.count !== a.count) return b.count - a.count;
                          return a.start - b.start;
                        });

                      const participants = Object.keys(responses).sort((a, b) => {
                        if (a === nickname) return -1;
                        if (b === nickname) return 1;
                        return a.localeCompare(b);
                      });

                      return (
                        <div className="space-y-6">
                          {/* Unified "가능한 시간표" Card */}
                          <div className="bg-white border-2 border-[#FFC93C] rounded-3xl p-6 shadow-md space-y-6">
                            {/* Card Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F7F5EC] pb-4">
                              <div className="flex items-center gap-2.5">
                                <Calendar className="w-5 h-5 text-[#A9700F]" />
                                <h3 className="font-extrabold text-[#2B2822] text-sm md:text-base">
                                  {dateLabel(activeSelectedDate)} 가능한 시간표
                                </h3>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8C8779] bg-[#F7F5EC] px-3 py-1.5 rounded-full border border-[#ECE7DA]">
                                <Users className="w-3.5 h-3.5 text-[#A9700F]" />
                                <span>제출 완료: {overlapData.total}명 / 방 전체: {Object.keys(responses).length}명</span>
                              </div>
                            </div>

                            {/* Section: [가능한 시간] Grid Table matching the drawing */}
                            <div className="space-y-4">
                              <div className="text-center">
                                <h4 className="text-sm font-extrabold text-[#2B2822] uppercase tracking-wider flex items-center justify-center gap-1.5">
                                  <Table className="w-4 h-4 text-[#A9700F]" />
                                  <span>[가능한 시간]</span>
                                </h4>
                              </div>

                              {!hasParticipants || segments.length === 0 ? (
                                <div className="text-center py-12 bg-[#F7F5EC]/40 border border-dashed border-[#DFD9C6] rounded-2xl text-xs text-gray-400 italic">
                                  아직 일정을 제출한 사용자가 없습니다.
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-2xl border border-[#DFD9C6] shadow-sm">
                                  <table className="w-full border-collapse text-left bg-white text-xs">
                                    <thead>
                                      <tr className="bg-[#F7F5EC] border-b border-[#DFD9C6]">
                                        <th className="p-3.5 font-bold text-[#2B2822] border-r border-[#DFD9C6] min-w-[150px] text-center">
                                          사용자/ 시간대
                                        </th>
                                        {participants.map((user) => (
                                          <th
                                            key={user}
                                            className="p-3.5 font-bold text-[#2B2822] text-center border-r border-[#DFD9C6] last:border-r-0 min-w-[100px]"
                                          >
                                            {user} {user === nickname && "(나)"}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {segments.map((seg, idx) => {
                                        // "사용자 모두 가능이면 그 시간대 자체가 초록색으로 표시되게 해줘"
                                        const isPerfect = seg.count === participants.length && participants.length > 0;
                                        
                                        const slotLabel = `${minToTimeAMPM(seg.start)} ~ ${minToTimeAMPM(seg.end)}`;

                                        return (
                                          <tr
                                            key={idx}
                                            className={`border-b border-[#ECE7DA] last:border-b-0 transition-colors ${
                                              isPerfect 
                                                ? "bg-emerald-50/40 hover:bg-emerald-100/50" 
                                                : "hover:bg-[#F7F5EC]/30"
                                            }`}
                                          >
                                            <td className={`p-3.5 font-mono text-center border-r ${
                                              isPerfect 
                                                ? "border-[#DFD9C6] bg-emerald-100/90 text-emerald-800 font-extrabold" 
                                                : "border-[#DFD9C6] text-[#2B2822] font-bold"
                                            }`}>
                                              {slotLabel}
                                            </td>
                                            {participants.map((user) => {
                                              const isAvailable = seg.names.includes(user);
                                              
                                              return (
                                                <td
                                                  key={user}
                                                  className={`p-3.5 border-r border-[#DFD9C6] last:border-r-0 text-center ${
                                                    isPerfect
                                                      ? "bg-emerald-100/90 text-emerald-800 font-extrabold"
                                                      : isAvailable
                                                        ? "bg-emerald-100/90 text-emerald-800 font-bold"
                                                        : "text-gray-300"
                                                  }`}
                                                >
                                                  {isPerfect ? "가능" : isAvailable ? "가능" : ""}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Popover Tooltip for active Segment hover */}
                    <AnimatePresence>
                      {activeTooltip && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="bg-[#2B2822] text-white p-4 rounded-xl shadow-lg border border-black/10 space-y-1 max-w-sm"
                        >
                          <div className="text-[10px] font-bold tracking-wider text-[#FFC93C] uppercase">
                            시간대 상세 정보 ({dateLabel(activeTooltip.date)})
                          </div>
                          <div className="text-sm font-bold font-mono">
                            {minToTimeAMPM(activeTooltip.segment.start)} ~{" "}
                            {minToTimeAMPM(activeTooltip.segment.end)}
                          </div>
                          <div className="text-xs pt-1 flex items-center gap-1 text-white/90">
                            <Users className="w-3.5 h-3.5 text-[#FFC93C]" />
                            <span>
                              참여 가능한 친구들 ({activeTooltip.segment.count} /{" "}
                              {activeTooltip.total}명)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1.5">
                            {activeTooltip.segment.names.map((name) => (
                              <span
                                key={name}
                                className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-12 text-center text-[11px] text-[#B7B2A0] border-t border-[#ECE7DA] pt-4 space-y-1 font-medium">
        <div>언제겜해? - 간편하게 조율하는 같이 게임할 시간</div>
        <div>
          개발자 정보 및 보안: 데이터가 서버의 JSON 형식 파일로 안전하게 관리되고 있습니다.
        </div>
      </footer>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmDate && (
          <div className="fixed inset-0 bg-[#2B2822]/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-[#FFC93C] rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4"
            >
              <div className="flex items-center gap-2.5 text-red-600">
                <Trash2 className="w-5 h-5 animate-bounce" />
                <h3 className="font-bold text-base text-[#2B2822]">선택 날짜 삭제</h3>
              </div>
              
              <p className="text-xs text-[#5C574C] leading-relaxed">
                <span className="font-bold text-[#2B2822]">{dateLabel(deleteConfirmDate)}</span> 날짜를 정말 내 목록에서 삭제하시겠습니까?<br />해당 날짜에 등록된 내 시간대도 함께 삭제됩니다.
              </p>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setDeleteConfirmDate(null)}
                  className="px-4 py-2 bg-[#F7F5EC] hover:bg-[#ECE7DA] text-[#5C574C] font-semibold text-xs rounded-xl border border-[#DFD9C6] transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    const ds = deleteConfirmDate;
                    setDeleteConfirmDate(null);
                    await handleDeleteMySelectedDate(ds);
                  }}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  삭제하기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Popover Global Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#2B2822] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 z-50 border border-white/10"
          >
            <Sparkles className="w-4 h-4 text-[#FFC93C]" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
