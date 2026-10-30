import Image from "next/image";
import styles from "./BrandMark.module.css";

/** 以原始直式 Logo 的圖示搭配可讀文字，適應橫式導覽列。 */
export default function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brand} ${compact ? styles.compact : ""}`}>
      <span className={styles.symbol} aria-hidden="true">
        <Image src="/img/logo.png" alt="" width={1402} height={1122} sizes="104px" loading="eager" className={styles.symbolImage} />
      </span>
      <span className={styles.wordmark}>
        <span className={styles.name}>智行進業</span>
        {!compact && <span className={styles.caption}>BizPilot AI</span>}
      </span>
    </span>
  );
}
