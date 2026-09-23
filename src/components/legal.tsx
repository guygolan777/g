import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/app-shell";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/constants";

/** Shared layout for the public legal pages (privacy, terms, account deletion). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Page size="narrow" withNav={false}>
      <PageHeader title={title} back />
      <article className="space-y-6 pb-6 text-[15px] leading-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ms-5 [&_li]:list-disc [&_ul]:space-y-1">
        <p className="text-sm text-muted-foreground">עודכן לאחרונה: {LEGAL_UPDATED}</p>
        {children}
        <section>
          <h2>יצירת קשר</h2>
          <p>
            לכל שאלה או בקשה:{" "}
            <span dir="ltr" className="select-all font-semibold">
              {CONTACT_EMAIL}
            </span>
          </p>
        </section>
        <nav className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm font-semibold text-primary">
          <Link to="/privacy">מדיניות פרטיות</Link>
          <Link to="/terms">תנאי שימוש</Link>
          <Link to="/delete-account">מחיקת חשבון</Link>
        </nav>
      </article>
    </Page>
  );
}
