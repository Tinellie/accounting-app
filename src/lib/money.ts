const MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * 将金额字符串转换为整数分，避免使用小数运算产生精度误差。
 * @param amount 金额字符串，最多包含两位小数，例如 "15.80"。
 * @returns 金额对应的整数分，例如 1580。
 * @throws 输入格式无效或金额超出安全整数范围时抛出错误。
 */
export function toMinorUnits(amount: string): number {
  const match = MONEY_PATTERN.exec(amount.trim());

  if (!match) {
    throw new TypeError("金额格式无效，请输入最多两位小数的金额");
  }

  const [, sign, wholePart, fractionalPart = ""] = match;
  const absoluteAmount = Number(wholePart) * 100 + Number(fractionalPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(absoluteAmount)) {
    throw new RangeError("金额超出可处理范围");
  }

  return sign === "-" ? -absoluteAmount : absoluteAmount;
}

/**
 * 将整数分格式化为固定两位小数的金额字符串。
 * @param amount 以分为单位的安全整数，例如 1580。
 * @returns 格式化后的金额字符串，例如 "15.80"。
 * @throws 输入不是安全整数时抛出错误。
 */
export function formatMinorUnits(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("金额必须是安全范围内的整数分");
  }

  const sign = amount < 0 ? "-" : "";
  const absoluteAmount = Math.abs(amount);
  const wholePart = Math.floor(absoluteAmount / 100);
  const fractionalPart = String(absoluteAmount % 100).padStart(2, "0");

  return `${sign}${wholePart}.${fractionalPart}`;
}