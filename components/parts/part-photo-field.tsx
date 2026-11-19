"use client";

import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Image } from "antd";
import { useRef, useState, type ChangeEvent } from "react";
import {
  PART_PHOTO_LIMIT, PART_PHOTO_MAX_BYTES, partPhotoMimeTypes, type PartPhotoInput,
} from "@/lib/parts";
import { partPhotoSource, StoredPartPhoto } from "./part-photos";
import styles from "./parts.module.css";

type NewPhoto = Extract<PartPhotoInput, { data: string }>;

async function resizePhoto(file: File) {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error(`无法读取照片 ${file.name}。`);
  }
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前设备无法压缩照片，请选择较小的图片。");

    for (const maxSide of [1600, 1200, 900]) {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (compressed && compressed.size <= PART_PHOTO_MAX_BYTES) return compressed;
    }
  } finally {
    image.close();
  }
  throw new Error(`照片 ${file.name} 压缩后仍超过 1 MB，请选择较小的图片。`);
}

async function readPhoto(file: File): Promise<NewPhoto> {
  if (!file.size) throw new Error(`照片 ${file.name} 为空。`);
  if (!partPhotoMimeTypes.some((type) => type === file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  const source = file.size <= PART_PHOTO_MAX_BYTES ? file : await resizePhoto(file);
  const mimeType = partPhotoMimeTypes.find((type) => type === source.type);
  if (!mimeType) throw new Error("请选择 JPG、PNG 或 WebP 图片。");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取照片 ${file.name}。`));
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result.split(",")[1] : undefined;
      if (data) resolve({ mimeType, data });
      else reject(new Error(`无法读取照片 ${file.name}。`));
    };
    reader.readAsDataURL(source);
  });
}

export function PartPhotoField({
  id, value = [], onChange, disabled, reading, setReading,
}: {
  id?: string;
  value?: PartPhotoInput[];
  onChange?: (photos: PartPhotoInput[]) => void;
  disabled: boolean;
  reading: boolean;
  setReading: (reading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    if (value.length + files.length > PART_PHOTO_LIMIT) {
      setError(`每条记录最多上传 ${PART_PHOTO_LIMIT} 张照片。`);
      return;
    }
    setReading(true);
    try {
      const photos: NewPhoto[] = [];
      for (const file of files) photos.push(await readPhoto(file));
      onChange?.([...value, ...photos]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取照片失败，请重试。");
    } finally {
      setReading(false);
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className={styles.photoGrid}>
          {value.map((photo, index) => {
            const label = `配件照片 ${index + 1}`;
            return (
              <div className={styles.photoTile} key={"id" in photo ? photo.id : index}>
                {"data" in photo
                  ? <Image src={partPhotoSource(photo)} className={styles.photo} alt={label} />
                  : <StoredPartPhoto id={photo.id} label={label} />}
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={`移除第 ${index + 1} 张照片`}
                  disabled={disabled || reading}
                  onClick={() => {
                    onChange?.(value.filter((_, itemIndex) => itemIndex !== index));
                    setError("");
                  }}
                >
                  移除
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className={styles.photoActions}>
        <input
          ref={input}
          type="file"
          accept={partPhotoMimeTypes.join(",")}
          multiple
          hidden
          onChange={choose}
        />
        <Button
          id={id}
          icon={<UploadOutlined />}
          disabled={disabled || value.length >= PART_PHOTO_LIMIT}
          loading={reading}
          onClick={() => input.current?.click()}
        >
          选择照片
        </Button>
        <span className={styles.hint}>最多 {PART_PHOTO_LIMIT} 张，支持 JPG、PNG、WebP。大图会自动压缩至 1 MB 以内。</span>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
    </div>
  );
}
