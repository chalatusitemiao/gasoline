import styles from "./brand-mark.module.css";

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={styles.mark}
      style={{ width: size, height: size }}
    />
  );
}
