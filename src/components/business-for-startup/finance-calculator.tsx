"use client";
import { useId, useState } from "react";
import { breakEvenUnits } from "@/content/business-for-startup/financial-example";
const number = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n);
const compact = (n: number) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export function FinanceCalculator() {
  const id = useId();
  const [price, setPrice] = useState("100"), [variable, setVariable] = useState("40"), [fixed, setFixed] = useState("1500");
  const inputs = [price, variable, fixed], values = inputs.map(Number);
  const valid = inputs.every(v => v.trim() !== "") && values.every(Number.isInteger) && values[0] >= 1 && values[0] <= 1e6 && values[1] >= 0 && values[1] <= 1e6 && values[2] >= 0 && values[2] <= 1e9;
  const [sale, cost, overhead] = values;
  const units = valid ? breakEvenUnits(sale, cost, overhead) : null;
  const maxUnits = Math.max(10, Math.ceil((units ?? 25) * 1.6));
  const maxMoney = Math.max(sale * maxUnits, overhead + cost * maxUnits, 1);
  const x = (n: number) => 68 + n / maxUnits * 460;
  const y = (n: number) => 230 - n / maxMoney * 180;
  const fields = [{ label: "Giá bán / sản phẩm", value: price, set: setPrice, max: 1e6, min: 1 }, { label: "Biến phí / sản phẩm", value: variable, set: setVariable, max: 1e6, min: 0 }, { label: "Chi phí cố định / kỳ", value: fixed, set: setFixed, max: 1e9, min: 0 }];
  return <div className="bfs-calculator">
    <div className="bfs-calc-fields">{fields.map((field, index) => <label key={field.label} htmlFor={`${id}-${index}`}><span>{field.label}</span><span className="bfs-number-wrap"><input id={`${id}-${index}`} type="number" inputMode="numeric" min={field.min} max={field.max} step={1} value={field.value} onChange={e => field.set(e.target.value)} aria-describedby={`${id}-unit`}/><small>nghìn đ</small></span></label>)}</div>
    <p className="bfs-small" id={`${id}-unit`}>Nhập số nguyên theo nghìn đồng, trong cùng một kỳ. Biến phí là chi phí thay đổi theo mỗi sản phẩm.</p>
    <div className="bfs-calc-result" role="status" aria-live="polite">{!valid ? <p>Nhập giá từ 1–1.000.000, biến phí từ 0–1.000.000 và chi phí cố định từ 0–1.000.000.000, theo nghìn đồng.</p> : units === null ? <p>Lãi góp không dương: mô hình hiện tại chưa có sản lượng hòa vốn. Thử thay giá hoặc biến phí.</p> : <><span>Hòa vốn từ</span><strong>{number(units)} <small>sản phẩm / kỳ</small></strong><p>Lãi góp {number(sale - cost)} nghìn đ/sản phẩm · Doanh thu tại mức này {number(units * sale)} nghìn đ</p></>}</div>
    {valid && units !== null && <div className="bfs-chart-scroll" role="region" aria-label="Biểu đồ hòa vốn, có thể cuộn ngang trên màn hình nhỏ" tabIndex={0}><svg className="bfs-finance-chart" viewBox="0 0 570 290" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Doanh thu và tổng chi phí theo sản lượng</title><desc id={`${id}-desc`}>Doanh thu bằng giá bán nhân sản lượng. Tổng chi phí bằng chi phí cố định cộng biến phí nhân sản lượng. Bắt đầu bù đủ chi phí từ {units} sản phẩm nguyên trong kỳ.</desc>
      {[0, 0.5, 1].map(f => <g key={f}><line x1="68" x2="528" y1={y(f * maxMoney)} y2={y(f * maxMoney)} stroke="#deded7" strokeDasharray="3 5"/><text x="57" y={y(f * maxMoney) + 4} textAnchor="end">{compact(f * maxMoney)}</text></g>)}
      <line x1="68" x2="528" y1="230" y2="230" stroke="#777"/><line x1="68" x2="68" y1="38" y2="230" stroke="#777"/>
      <text x="68" y="24">Nghìn đồng / kỳ</text><text x="528" y="278" textAnchor="end">Sản phẩm / kỳ</text>
      {[0, Math.round(maxUnits / 2), maxUnits].map(n => <text key={n} x={x(n)} y="250" textAnchor="middle">{compact(n)}</text>)}
      <line x1={x(0)} y1={y(0)} x2={x(maxUnits)} y2={y(sale * maxUnits)} stroke="#20201d" strokeWidth="3"/>
      <line x1={x(0)} y1={y(overhead)} x2={x(maxUnits)} y2={y(overhead + cost * maxUnits)} stroke="#838379" strokeWidth="2.5" strokeDasharray="7 5"/>
      <line x1={x(units)} x2={x(units)} y1={y(sale * units)} y2="230" stroke="#99998e" strokeDasharray="3 4"/><circle cx={x(units)} cy={y(sale * units)} r="5" fill="#20201d" stroke="#fff" strokeWidth="2"/>
    </svg></div>}
    {valid && units !== null && <div className="bfs-chart-legend"><span><i/>Doanh thu</span><span><i className="bfs-dashed"/>Tổng chi phí</span></div>}
  </div>;
}
