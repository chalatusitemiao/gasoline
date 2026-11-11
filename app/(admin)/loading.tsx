import styles from "./admin.module.css";

export default function AdminLoading() {
  return (
    <div className={styles.routeLoading} role="status">
      正在加载页面…
      <div className={styles.routeSkeleton} aria-hidden="true" />
    </div>
  );
}
