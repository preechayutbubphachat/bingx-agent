import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type RegridPhase2AReadinessCardProps = {
  paper: PaperVM;
};

function statusLabel(status: string): string {
  if (status === "NOT_READY") return "ยังไม่พร้อม";
  if (status === "WATCH") return "เฝ้าระวัง";
  if (status === "READY_FOR_OPERATOR_REVIEW") return "พร้อมให้ Operator ตรวจ";
  return "ไม่ทราบ";
}

function policyLabel(policy: string): string {
  if (policy === "QUARANTINE_OLD_ONE_SIDED_EXPOSURE") return "แยก exposure BUY เดิมไว้ ไม่เอาไปนับเป็น closed cycle";
  if (policy === "DO_NOT_COUNT_AS_CLOSED_CYCLE") return "ไม่นับ exposure เดิมเป็น closed cycle";
  if (policy === "DO_NOT_FORCE_SELL") return "ไม่ force SELL";
  if (policy === "DO_NOT_USE_FOR_EXPECTANCY") return "ไม่นำไปใช้คำนวณ expectancy";
  return policy;
}

function boolLabel(value: boolean, falseText: string, trueText: string): string {
  return value ? trueText : falseText;
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#dcc7aa] bg-white/75 px-2 py-1.5">
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[#dcc7aa] bg-white/70 p-2">
      <div className="text-[11px] font-black text-[#5b4432]">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(items.length ? items : ["ยังไม่มีข้อมูล"]).map((item) => (
          <span key={item} className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-bold text-[#6d5745]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegridPhase2AReadinessCard({ paper }: RegridPhase2AReadinessCardProps) {
  const readiness = paper.regridReadiness;
  const epoch = paper.paperEpoch;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#fff7eb] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">ความพร้อม Regrid Phase 2-A</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            เตรียม readiness และ paper epoch เท่านั้น ไม่เปิดกริดใหม่ ไม่ส่งคำสั่ง และไม่ปลดล็อกเงินจริง
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {statusLabel(readiness.status)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="สถานะความพร้อม" value={statusLabel(readiness.status)} />
        <Field label="คะแนนความพร้อม" value={readiness.score} />
        <Field
          label="ต้องให้ Operator review หรือไม่"
          value={readiness.operatorReviewRequired ? "ต้องให้ Operator ตรวจ" : "ยังไม่ถึงขั้น Operator review"}
        />
        <Field
          label="อนุญาต Paper activation หรือไม่"
          value={boolLabel(readiness.paperActivationAllowed, "ยังไม่อนุญาตให้เปิดกริด Paper", "อนุญาต Paper activation")}
        />
        <Field
          label="อนุญาต Live activation หรือไม่"
          value={boolLabel(readiness.liveActivationAllowed, "ห้ามเปิดเงินจริง", "อนุญาตเงินจริง")}
        />
        <Field label="สถานะ paper epoch" value={epoch.nextEpochStatus ?? "ยังไม่มีข้อมูล"} />
        <Field label="currentEpochId" value={epoch.currentEpochId ?? "ยังไม่มีข้อมูล"} />
        <Field label="nextEpochCandidateId" value={epoch.nextEpochCandidateId ?? "ยังไม่มีข้อมูล"} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <ListBlock title="Gate ที่ผ่าน" items={readiness.passedGates} />
        <ListBlock title="Gate ที่ยังไม่ผ่าน" items={readiness.failedGates} />
        <ListBlock title="เหตุผลที่ยังไม่เปิดกริดใหม่" items={readiness.warnings} />
        <ListBlock title="นโยบาย exposure เดิม" items={epoch.oldExposurePolicy.map(policyLabel)} />
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-black leading-relaxed text-amber-950">
        nextAction: {readiness.nextAction ?? "ยังไม่มีข้อมูล"} · {epoch.previousEpochReason ?? "ยังไม่มีข้อมูล epoch เดิม"}
      </div>
    </section>
  );
}
