import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { CONTACT_EMAIL } from "@/lib/constants";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/delete-account")({
  head: () => seo({ title: "מחיקת חשבון", description: "איך מוחקים את חשבון ה-mibale ואיזה מידע נמחק." }),
  component: DeleteAccountInfo,
});

function DeleteAccountInfo() {
  const { user } = useAuth();
  return (
    <LegalPage title="מחיקת חשבון mibale">
      <section>
        <h2>מחיקה מתוך האפליקציה</h2>
        <ul>
          <li>נכנסים לפרופיל ← הגדרות.</li>
          <li>בוחרים ״מחיקת החשבון״, מקלידים ״מחיקה״ ומאשרים.</li>
        </ul>
        {user && (
          <Button asChild variant="outline" size="lg" className="mt-4 w-full">
            <Link to="/settings">מעבר להגדרות</Link>
          </Button>
        )}
      </section>

      <section>
        <h2>בלי גישה לאפליקציה</h2>
        <p>
          שלחו מייל אל{" "}
          <span dir="ltr" className="select-all font-semibold">
            {CONTACT_EMAIL}
          </span>{" "}
          מהכתובת שרשומה בחשבון, עם הנושא ״מחיקת חשבון״. נמחק את החשבון תוך 7 ימים ונאשר במייל.
        </p>
      </section>

      <section>
        <h2>מה נמחק</h2>
        <p>
          הכול, מיד ולצמיתות: הפרופיל והתמונות, הסטוריז, ההודעות, האירועים והקהילות שפתחת, ההצטרפויות, הלייקים וההתאמות, המיקום ומזהי ההתראות. לא נשמר
          עותק. דיווחים שהגשת נשארים ללא שיוך אליך, לצורכי בטיחות.
        </p>
      </section>
    </LegalPage>
  );
}
