# TradingAgentHQ — Asset & Scene Spec

> THQ-0 asset inventory + scene placement + sprite export spec
> แหล่งไอเดีย: `TradingAgentHQ/` folder (read-only) · อ้าง Layer 13 architecture

---

## 1) Asset Inventory (THQ-0)

| Path (ใน `TradingAgentHQ/`) | ประเภท | สถานะ | ใช้ทำอะไรต่อ |
|---|---|---|---|
| `หัวข้อ Trading Agent HQ - AI Second Brain for Trading.docx` | design prompt / idea | source idea | spec อ้างอิงหลัก (modes/agents/UX) |
| `00-ภาพรวม/Prompt สำหรับ 6 ตัวพร้อมกัน.docx` | design prompt | sprite prompt | gen sprite sheet 6 ตัว โทนเดียวกัน |
| `00-ภาพรวม/file_*.png` ×3 | concept lineup | concept | reference โทน/ทีม |
| `01-Trend Bot/Trend_Bot-design.png` + `file_*.png` + prompt docx | character design | design (ยังไม่ใช่ sprite) | แตกเป็น sprite sheet |
| `02-Grid_Bot/Grid_Bot-design.png` + `file_*.png` + prompt docx | character design | design | แตกเป็น sprite sheet |
| `03-Risk_Manager/Risk_manager-design.png` + `file_*.png` + prompt docx | character design | design | แตกเป็น sprite sheet |
| `04-News_Analyst/News_Analyst-design.png` + `file_*.png` + prompt docx | character design | design | แตกเป็น sprite sheet |
| `05-Market_Regime/Market_Regime-design.png` + `file_*.png` + prompt docx | character design | design | แตกเป็น sprite sheet |
| `06-Memory_Second Brain/Memory_Second-Brain-design.png` + `file_*.png` + prompt docx | character design | design | แตกเป็น sprite sheet |
| `Screenshot_27-5-2026_..._ob-gate.com.jpeg` | current dashboard ref | reference | เทียบ Classic mode |

**Classification:** design PNG = character art (ยังไม่ใช่ game-ready sprite sheet) · ยังไม่มี: background scene, sprite sheets (256×256 grid), scene config, sprite metadata → ต้องผลิตใน THQ-2
**Validate:** asset ทั้งหมดเป็นภาพ/ข้อความ design — **ไม่มี secret/runtime data** ปลอดภัยเข้า `public/assets/`

---

## 2) Scene Placement

- background: **1672 × 941** · coordinate: top-left · sprite anchor: bottom-center · default frame: **256 × 256**

| Agent | x | y | scale | zIndex |
|---|---|---|---|---|
| Grid Bot | 470 | 475 | 0.78 | 30 |
| Trend Bot | 230 | 610 | 0.82 | 40 |
| Risk Manager | 430 | 790 | 0.84 | 60 |
| News Analyst | 1245 | 455 | 0.78 | 30 |
| Market Regime | 1410 | 610 | 0.82 | 40 |
| Memory / Second Brain | 1245 | 790 | 0.84 | 60 |

## 3) Z-index Layering
| layer | z |
|---|---|
| background | 0 |
| desk highlight | 10 |
| sprite upper row | 30 |
| sprite middle row | 40 |
| sprite lower row | 60 |
| bubble | 100 |
| selected outline | 110 |
| right inspector | 200 |
| top HUD | 300 |
| modal/debug | 500 |

## 4) Sprite Export Spec
| field | value |
|---|---|
| frameWidth | 256 |
| frameHeight | 256 |
| columns | 6 |
| rows | 4 |
| totalFrames | 24 |
| sheetWidth | 1536 |
| sheetHeight | 1024 |
| format | PNG |
| background | transparent |
| anchor | bottom-center |

**Row convention (แนะนำ):** row0 = front/idle · row1 = working · row2 = alert/happy · row3 = paused/error
**Per-agent palette (จาก prompt):** Grid=mint/sage · Trend=purple · Risk=navy/steel · News=pink/peach · Regime=sage/olive · Memory=cream/brown

## 5) Target asset folder
```
dashboard/public/assets/trading-agent-hq/
  background/  scene_main_1672x941.png
  sprites/     grid_bot.png  trend_bot.png  risk_manager.png
               news_analyst.png  market_regime.png  memory_brain.png
```
