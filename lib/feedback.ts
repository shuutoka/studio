export type FeedbackLabel = "Bug" | "Amélioration" | "Nouvelle fonctionnalité";

export type FeedbackMessage = {
  name: string;
  title: string;
  label: FeedbackLabel;
  body: string;
};

const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/ggchoutca@gmail.com";

export async function sendFeedback(message: FeedbackMessage) {
  const form = new FormData();
  form.append("Nom", message.name.trim());
  form.append("Titre", message.title.trim());
  form.append("Type", message.label);
  form.append("Message", message.body.trim());
  form.append("_subject", `[Enfer Fatal Studio] ${message.label} — ${message.title.trim()}`);
  form.append("_template", "table");
  form.append("_url", window.location.href);

  let response: Response;
  try {
    response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    });
  } catch {
    throw new Error("Le service de feedback est injoignable. Vérifiez votre connexion puis réessayez.");
  }

  const result = await response.json().catch(() => null) as { success?: boolean | string; message?: string } | null;
  const succeeded = result?.success === true || result?.success === "true";
  if (!response.ok || !succeeded) {
    throw new Error(result?.message || "Le message n’a pas pu être envoyé.");
  }
}
