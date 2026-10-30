"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, FileText, FlaskConical, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound, Workflow } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { login, register as registerAccount } from "@/lib/account";
import styles from "./AuthForm.module.css";

type Mode = "login" | "register";
type FieldName = "display_name" | "email" | "password" | "confirm_password";

const MIN_PASSWORD = 8;

/** 登入與註冊個人帳號；完成後到「我的工作區」，再建立或加入公司工作區 */
export default function AuthForm({ mode }: { mode: Mode }) {
  const register = mode === "register";
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const display_name = String(data.get("display_name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const nextErrors: Partial<Record<FieldName, string>> = {};
    if (register && (!display_name || display_name.length > 80)) nextErrors.display_name = "請填寫 1–80 個字的顯示姓名。";
    // 登入也接受舊版公司帳號的帳號名稱，只有註冊時檢查電子郵件格式
    if (register ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 : !email) nextErrors.email = register ? "請輸入有效的電子郵件地址。" : "請輸入電子郵件或帳號。";
    if (register ? password.length < MIN_PASSWORD : !password) nextErrors.password = register ? `密碼至少 ${MIN_PASSWORD} 個字元。` : "請輸入你的密碼。";
    if (register && password !== data.get("confirm_password")) nextErrors.confirm_password = "兩次輸入的密碼不一致。";
    setErrors(nextErrors); setError("");
    const first = Object.keys(nextErrors)[0];
    if (first) { formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus(); return; }
    submitting.current = true; setBusy(true);
    try {
      if (register) await registerAccount(email, password, display_name);
      else await login(email, password);
      router.replace("/welcome");
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失敗，請再試一次。");
    } finally {
      submitting.current = false; setBusy(false);
    }
  };

  const field = (name: FieldName, label: string, type: string, placeholder: string, autoComplete: string) => <div className={styles.field}>
    <label htmlFor={name}>{label}</label>
    <div className={styles.inputWrap}>
      {name === "email" ? <Mail size={20} className={styles.fieldIcon} aria-hidden /> : name === "display_name" ? <UserRound size={20} className={styles.fieldIcon} aria-hidden /> : <LockKeyhole size={20} className={styles.fieldIcon} aria-hidden />}
      <input id={name} name={name} type={type} placeholder={placeholder} autoComplete={autoComplete} required disabled={busy} minLength={register && (name === "password" || name === "confirm_password") ? MIN_PASSWORD : undefined} maxLength={name === "email" ? 254 : name === "display_name" ? 80 : 128} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : register && name === "password" ? "password-hint" : undefined} />
      {name === "password" && <button type="button" className={styles.passwordToggle} disabled={busy} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "隱藏密碼" : "顯示密碼"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={21} aria-hidden /> : <Eye size={21} aria-hidden />}</button>}
    </div>
    {errors[name] ? <p className={styles.fieldError} id={`${name}-error`}>{errors[name]}</p> : register && name === "password" ? <p className={styles.fieldHint} id="password-hint">密碼至少 {MIN_PASSWORD} 個字元。</p> : null}
  </div>;

  return <div className={styles.page}>
    <header className={styles.header}><Link href="/" aria-label="智行進業首頁"><BrandMark /></Link><Link href="/" className={styles.back}><ArrowLeft size={18} aria-hidden />回到首頁</Link></header>
    <main className={styles.main}>
      <aside className={styles.story} aria-labelledby="story-title">
        <p className={styles.eyebrow}><Sparkles size={18} aria-hidden />從企業實際工作出發</p>
        <h2 id="story-title">讓企業問題，成為<br /><span>AI 導入的起點。</span></h2>
        <p className={styles.storyIntro}>從日常流程到具體需求，<br />和團隊一起找到適合的 AI 應用方向。</p>
        <ol className={styles.journey}>
          {[{ title: "了解企業現況", icon: Workflow }, { title: "探索 AI 與人機分工", icon: Sparkles }, { title: "模擬測試導入情境", icon: FlaskConical }, { title: "形成導入需求草案", icon: FileText }].map((step, index) => <li key={step.title}><span className={styles.journeyIcon}><step.icon size={23} aria-hidden /></span><span>{step.title}</span><span className={styles.journeyNumber}>0{index + 1}</span></li>)}
        </ol>
      </aside>
      <section className={`${styles.formPanel} ${register ? styles.registerPanel : ""}`} aria-labelledby="auth-title">
        <nav className={styles.tabs} aria-label="帳號入口"><Link href="/login" aria-current={!register ? "page" : undefined}>登入</Link><Link href="/register" aria-current={register ? "page" : undefined}>註冊</Link></nav>
        <div className={styles.formHeading}><span className={styles.welcomeIcon}>{register ? <UserRound size={25} aria-hidden /> : <ShieldCheck size={25} aria-hidden />}</span><h1 id="auth-title">{register ? "建立你的個人帳號" : "歡迎回來"}</h1><p>{register ? "開始探索，找到屬於企業的 AI 導入方向。" : "登入智行進業，接續你與團隊的探索。"}</p></div>
        <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy} className={`${styles.form} ${register ? styles.registerForm : ""}`}>
          {register && field("display_name", "顯示姓名", "text", "你的姓名", "name")}
          {field("email", register ? "電子郵件" : "電子郵件或帳號", register ? "email" : "text", "you@company.com", register ? "email" : "username")}
          {field("password", "密碼", showPassword ? "text" : "password", register ? "設定登入密碼" : "輸入你的密碼", register ? "new-password" : "current-password")}
          {register && field("confirm_password", "確認密碼", showPassword ? "text" : "password", "再次輸入密碼", "new-password")}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.submit} disabled={busy}>{busy ? <LoaderCircle size={21} className={styles.spinner} aria-hidden /> : null}{busy ? register ? "建立帳號中…" : "登入中…" : register ? "註冊並開始探索" : "登入並繼續探索"}{!busy && <ArrowRight size={20} aria-hidden />}</button>
        </form>
        <p className={styles.switch}>{register ? "已經有帳號？" : "還沒有帳號？"}<Link href={register ? "/login" : "/register"}>{register ? "前往登入" : "建立個人帳號"}</Link></p>
        <p className={styles.switch}>不想登入？<Link href="/start">直接使用（不會保存紀錄）</Link></p>
        <p className={styles.accountNote}><ShieldCheck size={18} aria-hidden />{register ? "註冊成功後，即可建立或加入工作區。" : "使用個人帳號，保存你的探索進度。"}</p>
      </section>
    </main>
  </div>;
}
