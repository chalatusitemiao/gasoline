import { invoke } from "@tauri-apps/api/core";
import { Alert, Button, Modal, Space, Spin, Typography } from "antd";
import { useRef, useState, type ReactNode } from "react";

type DesktopUpdate = { version: string; notes: string };

type UpdateState =
  | { phase: "checking" | "current" }
  | { phase: "check-error"; error: string }
  | { phase: "available" | "installing" | "launched"; update: DesktopUpdate }
  | { phase: "install-error"; update: DesktopUpdate; error: string };

function describeError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useDesktopUpdates() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UpdateState>({ phase: "checking" });
  const pending = useRef(false);

  async function checkForUpdate() {
    if (pending.current) return;
    pending.current = true;
    setState({ phase: "checking" });
    try {
      const update = await invoke<DesktopUpdate | null>("check_for_update");
      setState(update ? { phase: "available", update } : { phase: "current" });
    } catch (error) {
      setState({ phase: "check-error", error: describeError(error, "检查更新失败，请重试。") });
    } finally {
      pending.current = false;
    }
  }

  async function installUpdate(update: DesktopUpdate) {
    if (pending.current) return;
    pending.current = true;
    setState({ phase: "installing", update });
    try {
      await invoke<void>("install_update", { version: update.version });
      setState({ phase: "launched", update });
    } catch (error) {
      setState({ phase: "install-error", update, error: describeError(error, "下载安装失败，请重试。") });
    } finally {
      pending.current = false;
    }
  }

  function openUpdateDialog() {
    setOpen(true);
    void checkForUpdate();
  }

  function closeUpdateDialog() {
    setOpen(false);
  }

  const update = "update" in state ? state.update : null;
  const installing = state.phase === "installing" || state.phase === "launched";
  let footer: ReactNode = <Button onClick={closeUpdateDialog}>关闭</Button>;
  if (installing) {
    footer = null;
  } else if (update) {
    footer = (
      <Space>
        {state.phase === "install-error" ? (
          <Button onClick={() => void checkForUpdate()}>重新检查</Button>
        ) : <Button onClick={closeUpdateDialog}>稍后</Button>}
        <Button type="primary" onClick={() => void installUpdate(update)}>
          {state.phase === "install-error" ? "重试下载安装" : "下载并安装"}
        </Button>
      </Space>
    );
  } else if (state.phase === "check-error") {
    footer = (
      <Space>
        <Button onClick={closeUpdateDialog}>关闭</Button>
        <Button type="primary" onClick={() => void checkForUpdate()}>重试检查</Button>
      </Space>
    );
  }

  return {
    openUpdateDialog,
    updateDialog: (
      <Modal
        title="车辆监控更新"
        open={open}
        onCancel={closeUpdateDialog}
        closable={!installing}
        keyboard={!installing}
        maskClosable={false}
        footer={footer}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {state.phase === "checking" && <Space role="status"><Spin size="small" />正在检查更新…</Space>}
          {state.phase === "current" && <Alert type="success" showIcon message="当前已是最新版本" />}
          {update && (
            <>
              <Typography.Text strong>发现新版本 {update.version}</Typography.Text>
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "35vh", overflowY: "auto", marginBottom: 0 }}>
                {update.notes.trim() || "暂无更新说明。"}
              </Typography.Paragraph>
            </>
          )}
          {state.phase === "available" && (
            <Typography.Text type="secondary">启动安装程序后，车辆监控将退出。请先保存正在编辑的内容。</Typography.Text>
          )}
          {state.phase === "installing" && (
            <Space role="status"><Spin size="small" />正在下载安装包并校验，完成后将启动安装程序…</Space>
          )}
          {state.phase === "launched" && <Alert type="success" showIcon message="安装程序已启动，客户端正在退出。" />}
          {"error" in state && <Alert type="error" showIcon message={state.error} />}
        </Space>
      </Modal>
    ),
  };
}
