"use client";

import { CameraOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Image, Modal, Spin } from "antd";
import { useState } from "react";
import { useAppNavigation } from "@/components/app-navigation";
import { QueryError } from "@/components/fuel/ui";
import { apiFetch } from "@/lib/api-client";
import type { PartPhoto, PartPhotoData } from "@/lib/parts";
import styles from "./parts.module.css";

function partPhotoSource(photo: Pick<PartPhotoData, "mimeType" | "data">) {
  return `data:${photo.mimeType};base64,${photo.data}`;
}

export function StoredPartPhoto({ id, label }: { id: string; label: string }) {
  const { companyId, userId } = useAppNavigation();
  const photo = useQuery({
    queryKey: ["part-photo", companyId, userId, id],
    queryFn: ({ signal }) => apiFetch<PartPhotoData>(`/api/parts/photos/${encodeURIComponent(id)}`, { signal }),
    staleTime: 0,
    gcTime: 0,
  });

  if (photo.error) return <QueryError error={photo.error} retry={() => { void photo.refetch(); }} />;
  if (!photo.data) return <div className={styles.photoLoading} role="status" aria-label={`正在加载${label}`}><Spin size="small" /></div>;
  return <Image src={partPhotoSource(photo.data)} alt={label} className={styles.photo} />;
}

export function PartPhotos({ photos }: { photos: readonly PartPhoto[] }) {
  return (
    <div className={styles.photoGrid}>
      {photos.map((photo, index) => <StoredPartPhoto key={photo.id} id={photo.id} label={`配件照片 ${index + 1}`} />)}
    </div>
  );
}

export function PartPhotoButton({ photos }: { photos: readonly PartPhoto[] }) {
  const [open, setOpen] = useState(false);

  if (!photos.length) return <span>—</span>;
  return (
    <>
      <Button size="small" type="link" icon={<CameraOutlined />} onClick={() => setOpen(true)}>
        查看照片（{photos.length}）
      </Button>
      {open && (
        <Modal title="配件照片" open footer={null} width={680} onCancel={() => setOpen(false)}>
          <PartPhotos photos={photos} />
        </Modal>
      )}
    </>
  );
}
