"use client";

import Link from "next/link";
import { ArrowRight, Building2, Check, CheckCircle2, ChevronDown, CircleHelp, Eye, FileText, FlaskConical, Play, Search, Sparkles, Target, Workflow } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useAccount } from "@/lib/account";
import styles from "./HomePage.module.css";

const steps = [
  { title: "了解企業現況", description: "輸入公司背景資料，整理目前的工作流程與問題。", icon: Workflow },
  { title: "找出 AI 可以幫忙的地方", description: "分析哪些工作適合導入 AI，並規劃人員與 AI 的分工方式。", icon: Sparkles },
  { title: "模擬測試導入情境", description: "結合資料與實際情境，檢查導入時可能遇到的限制與缺口。", icon: FlaskConical },
  { title: "產出導入需求草案", description: "彙整分析結果，形成企業的 AI 導入需求與建議方向。", icon: FileText },
];

function StepPreview({ index }: { index: number }) {
  return <div className={styles.stepPreview} role="img" aria-label={`${steps[index].title}畫面示意，無法直接操作`}>
    <div className={styles.miniTop}>{index === 0 ? "企業現況整理" : index === 1 ? "人機分工方式比較" : index === 2 ? "情境測試" : "AI 導入需求草案"}<span>畫面示意</span></div>
    {index === 0 && <div className={styles.miniFields}>
      <div><span>公司名稱</span><strong>小名 3C 網店</strong></div>
      <div><span>目前工作</span><strong>訂單整理與客服回覆</strong></div>
      <div><span>想改善的問題</span><strong>重複輸入、回覆耗時</strong></div>
    </div>}
    {index === 1 && <div className={styles.miniMatrix}>
      <div><span>工作項目</span><span>人工</span><span>AI</span></div>
      <div><span>客服回覆</span><CheckCircle2 /><CheckCircle2 /></div>
      <div><span>訂單彙整</span><span>—</span><CheckCircle2 /></div>
      <div><span>異常判斷</span><CheckCircle2 /><span>—</span></div>
      <p><Sparkles size={19} />AI 協助整理，人工確認結果</p>
    </div>}
    {index === 2 && <div className={styles.miniSandbox}>
      <div className={styles.miniTabs}><span>選擇情境</span><span>測試結果</span></div>
      <div className={styles.scenario}><FlaskConical size={24} /><div><strong>客服詢問商品保固</strong><span>模擬資料與實際工作情境</span></div></div>
      <ul><li><CheckCircle2 />資料來源：已具備</li><li><CheckCircle2 />人工接管：需設定條件</li><li><CircleHelp />待釐清：權限與使用限制</li></ul>
    </div>}
    {index === 3 && <div className={styles.miniReport}>
      <div className={styles.reportLines} aria-hidden="true"><i /><i /><i /></div>
      <strong>建議導入項目</strong>
      <ol><li><span>1</span>智能客服回覆</li><li><span>2</span>訂單彙整與分析</li><li><span>3</span>商品資訊整理</li></ol>
    </div>}
  </div>;
}

function PlatformPreview() {
  return <div className={styles.preview} aria-label="平台操作預覽：企業基本資料填寫示意" aria-describedby="preview-notice">
    <div className={styles.previewTop}>
      <span className={styles.previewLabel}><Eye size={21} aria-hidden="true" />平台操作預覽</span>
      <p id="preview-notice" className={styles.previewNotice}>此為示意畫面，無法直接操作</p>
    </div>
    <div className={styles.previewBody}>
      <aside className={styles.previewNav} aria-label="探索步驟示意">
        <ol>{steps.map((step, index) => <li key={step.title} className={index === 0 ? styles.activeStep : undefined}><span>{index + 1}</span>{step.title}</li>)}</ol>
        <div className={styles.tip}><Sparkles size={22} /><strong>需要協助？</strong><p>從你的日常工作開始，讓我們一步步釐清。</p></div>
      </aside>
      <div className={styles.previewForm}>
        <p className={styles.stepLabel}>步驟 1 / {steps.length}</p><h2>{steps[0].title}</h2><p className={styles.formIntro}>{steps[0].description}</p>
        <div className={styles.formSection}><h3><Building2 size={21} />公司基本資料</h3>
          <div className={styles.fieldGrid}>
            <div className={styles.field}><span>公司名稱</span><div>小名 3C 網店</div></div>
            <div className={styles.field}><span>統一編號</span><div>00000000<Search size={16} /></div></div>
            <div className={styles.field}><span>公司類型</span><div>零售業<ChevronDown size={16} /></div></div>
            <div className={styles.field}><span>公司規模</span><div>11－50 人<ChevronDown size={16} /></div></div>
          </div>
          <div className={styles.field}><span>主要營業項目</span><div>3C 及小家電網路零售<ChevronDown size={16} /></div></div>
        </div>
        <div className={styles.formSection}><h3><Target size={21} />目前最想改善的問題</h3><p className={styles.sampleAnswer}>訂單分散在不同平台，需要人工整理；希望減少重複輸入，讓團隊有更多時間服務客戶。</p><div className={styles.tags}><span>訂單管理</span><span>重複性作業</span><span>客戶服務</span></div></div>
        <div className={styles.previewBottom}><span><CheckCircle2 size={18} />從企業背景開始</span><div className={styles.smallButton} aria-hidden="true">開始填寫<ArrowRight size={18} /></div></div>
      </div>
      <aside className={styles.previewInfo}><div className={styles.buildingScene} aria-hidden="true"><span /><Building2 strokeWidth={1.25} /><i /></div><h3>為什麼需要企業資料？</h3><ul><li><CheckCircle2 />建立企業背景</li><li><CheckCircle2 />分析實際需求</li><li><CheckCircle2 />聚焦適合的方向</li></ul></aside>
    </div>
  </div>;
}

export default function HomePage() {
  // 已登入時改成「我的工作區」，不然看起來像被登出了（確認中的 undefined 先當作沒登入顯示）
  const account = useAccount();
  return <div className={styles.page}>
    <a className={styles.skipLink} href="#main">跳至主要內容</a>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link href="/" aria-label="智行進業首頁"><BrandMark /></Link>
      <nav className={styles.nav} aria-label="主要導覽"><a href="#product">產品介紹</a><a href="#steps">四大步驟</a><a href="#resources">互動範例</a></nav>
      <div className={styles.accountNav}>{account
        ? <><span>{account.display_name || account.username}</span><Link className={styles.primaryButton} href="/welcome">我的工作區<ArrowRight size={19} /></Link></>
        : <><Link href="/login">登入</Link><Link className={styles.primaryButton} href="/register">立即開始探索<ArrowRight size={19} /></Link></>}</div>
    </div></header>
    <main id="main">
      <section id="product" className={styles.hero} aria-labelledby="hero-title"><div className={styles.heroInner}>
        <div className={styles.heroCopy}><p className={styles.eyebrow}>從企業實際工作出發，探索 AI 應用可能</p><h1 id="hero-title">讓企業問題，成為<br /><span>AI 導入的起點</span></h1><p className={styles.description}>不知道 AI 能協助哪些工作？從現有作業流程開始，逐步探索 AI 的應用方向與人機分工，並透過情境測試釐清導入所需條件，產出具體的 AI 導入需求草案。</p>
          <div className={styles.heroActions}>{account
            ? <Link className={styles.primaryButton} href="/welcome">進入我的工作區<ArrowRight size={22} /></Link>
            : <><Link className={styles.primaryButton} href="/register">立即開始探索<ArrowRight size={22} /></Link>
              {/* FAKE 沒有互動範例頁，改連到不用註冊、可載入示範流程的 /start */}
              <Link className={styles.secondaryButton} href="/start"><span className={styles.playIcon}><Play size={15} fill="currentColor" /></span>先試用，不用註冊</Link></>}</div>
          <ul className={styles.benefits}><li><Check />從現有工作釐清需求</li><li><Check />比較 AI 與人工分工</li><li><Check />情境測試找出導入缺口</li></ul>
        </div>
        <PlatformPreview />
      </div></section>
      <section id="steps" className={styles.stepsSection} aria-labelledby="steps-title"><div className={styles.sectionHeading}><p className={styles.stepsEyebrow}>從企業實際工作出發，探索 AI 應用可能</p><h2 id="steps-title">四大步驟，從企業問題找到 <span>AI 導入方向</span></h2><p>從現有工作出發，逐步釐清需求、比較人機分工、測試導入條件，最後形成需求草案。</p></div>
        <ol className={styles.stepCards}>{steps.map((step, index) => <li key={step.title} className={styles.stepCard}>
          <div className={styles.stepRail}><span className={styles.stepNumber}>0{index + 1}</span><span className={styles.stepDot} />{index < steps.length - 1 && <svg className={styles.flowConnector} viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true"><path d="M0 15 C100 -25 190 70 300 30" /><path d="M290 23 L300 30 L291 38" /></svg>}</div>
          <div className={styles.stepSummary}><span className={styles.stepIcon}><step.icon size={29} strokeWidth={1.7} /></span><div><h3>{step.title}</h3><p>{step.description}</p></div></div>
          <StepPreview index={index} />
        </li>)}</ol>
      </section>
      <section id="resources" className={styles.resources} aria-labelledby="resources-title">
        <div className={styles.resourceContent}>
          <div className={styles.resourceIllustration} aria-hidden="true">
            <span className={styles.illustrationLeaf} />
            <div className={styles.illustrationScreen}>
              <div className={styles.illustrationToolbar}><i /><i /><i /><span /></div>
              <div className={styles.illustrationDashboard}><aside><i /><i /><i /></aside><div><i /><i /><i /><i /></div></div>
              <span className={styles.illustrationPlay}><Play size={25} fill="currentColor" /></span>
            </div>
            <span className={`${styles.illustrationMessage} ${styles.messageLeft}`}><i /><i /></span>
            <span className={`${styles.illustrationMessage} ${styles.messageTop}`}><i /><i /></span>
            <span className={`${styles.illustrationMessage} ${styles.messageRight}`}><i /><i /></span>
          </div>
          <div><h2 id="resources-title">想先了解實際操作方式？</h2><p>透過互動範例，看看四個步驟如何串連。</p></div>
        </div>
        <Link href="/start">體驗互動範例<ArrowRight size={20} /></Link>
      </section>
    </main>
  </div>;
}
