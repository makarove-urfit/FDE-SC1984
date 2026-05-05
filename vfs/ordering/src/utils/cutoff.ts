export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface BlockedInfo { blocked: boolean; reason?: string }

export function checkDeliveryDate(date: string, cutoffTime: string, now: Date = new Date()): BlockedInfo {
  if (!date) return { blocked: true, reason: "未指定配送日期" };
  const today = toYMD(now);
  if (date < today) return { blocked: true, reason: "配送日期已過" };
  if (date === today && cutoffTime) {
    const [h, m] = cutoffTime.split(":").map(Number);
    if (now.getHours() * 60 + now.getMinutes() >= h * 60 + m) {
      return { blocked: true, reason: `已超過今日下單時間（${cutoffTime}）` };
    }
  }
  return { blocked: false };
}

export function getAvailableDates(holidays: Set<string>, cutoffTime: string, count = 7, now: Date = new Date()): string[] {
  const result: string[] = [];
  for (let i = 1; result.length < count && i <= 60; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const ymd = toYMD(d);
    if (holidays.has(ymd)) continue;
    if (!checkDeliveryDate(ymd, cutoffTime, now).blocked) result.push(ymd);
  }
  return result;
}
