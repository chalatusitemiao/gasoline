"use client";

import { Image } from "antd";
import { AdminPage } from "@/components/admin-page";
import type { UserRole } from "@/lib/permissions";
import { adminManual } from "./admin-manual";
import type { OperationManual } from "./manual-types";
import { platformManual } from "./platform-manual";
import { operatorManual, viewerManual } from "./staff-manuals";
import styles from "./operation-docs.module.css";

const manuals: Record<UserRole, OperationManual> = {
  super_admin: platformManual,
  admin: adminManual,
  operator: operatorManual,
  viewer: viewerManual,
};

export function OperationDocs({ role }: { role: UserRole }) {
  const { title, introduction, chapters } = manuals[role];

  return (
    <AdminPage title="操作文档">
      <div className={styles.layout}>
        <nav className={styles.contents} aria-labelledby="operation-docs-contents">
          <h2 id="operation-docs-contents">{title}操作目录</h2>
          <ol>
            {chapters.map(({ id, title: chapterTitle }) => (
              <li key={id}><a href={`#${id}`}>{chapterTitle}</a></li>
            ))}
          </ol>
        </nav>
        <article className={styles.manual} aria-label={`${title}操作手册`}>
          <p className={styles.introduction}>{introduction}</p>
          {chapters.map(({ id, title: chapterTitle, steps, note, figures }) => (
            <section className={styles.chapter} id={id} key={id} aria-labelledby={`${id}-heading`}>
              <h2 id={`${id}-heading`}>{chapterTitle}</h2>
              <ol className={styles.steps}>
                {steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              {note && <p className={styles.note}>{note}</p>}
              {figures?.map(({ file, caption }) => (
                <figure className={styles.figure} key={file}>
                  <Image
                    className={styles.screenshot}
                    src={`/operation-docs/${file}`}
                    alt={caption}
                    width="100%"
                    loading="lazy"
                  />
                  <figcaption>{caption}</figcaption>
                </figure>
              ))}
            </section>
          ))}
        </article>
      </div>
    </AdminPage>
  );
}
