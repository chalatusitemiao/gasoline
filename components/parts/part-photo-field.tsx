"use client";

import { DeleteOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { PartPhotoInput } from "@/lib/parts";
import { StoredPartPhoto } from "./part-photos";
import styles from "./parts.module.css";

export function PartPhotoField({
  value = [], onChange, disabled,
}: {
  value?: PartPhotoInput[];
  onChange?: (photos: PartPhotoInput[]) => void;
  disabled: boolean;
}) {
  if (value.length === 0) return <span className={styles.hint}>待保存后移除全部照片</span>;

  return (
    <div className={styles.photoGrid}>
      {value.map(({ id }, index) => (
        <div className={styles.photoTile} key={id}>
          <StoredPartPhoto id={id} label={`配件照片 ${index + 1}`} />
          <Button
            danger
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            aria-label={`移除第 ${index + 1} 张照片`}
            disabled={disabled}
            onClick={() => onChange?.(value.filter((photo) => photo.id !== id))}
          >
            移除
          </Button>
        </div>
      ))}
    </div>
  );
}
