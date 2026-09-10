import {
  CircleAlert,
  Cloud,
  Copyright,
  Database,
  ExternalLink,
  FileText,
  Mail,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { LEGAL_INFORMATION } from "@/lib/legal";

const linkClass =
  "inline-flex items-center gap-1 text-[#ff8a95] underline decoration-[#ef4f5f]/35 underline-offset-4 hover:text-[#ffabb3]";

export function LegalInformation({ compact = false }: { compact?: boolean }) {
  const content = (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">
          Transparence
        </div>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-[-.035em] text-white">
              Informations légales
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8f8996]">
              Mentions légales, confidentialité et conditions d’utilisation de {LEGAL_INFORMATION.siteName}.
            </p>
          </div>
          <span className="w-fit rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-[11px] text-[#8f8996]">
            En vigueur au {LEGAL_INFORMATION.effectiveDate}
          </span>
        </div>
      </header>

      <section aria-label="Résumé de confidentialité" className="mb-6 grid gap-3 md:grid-cols-3">
        <SummaryCard
          icon={Database}
          title="Créations locales"
          description="Projets, textes, images, polices et réglages restent dans le navigateur tant que vous ne choisissez pas un service externe."
        />
        <SummaryCard
          icon={ShieldCheck}
          title="Sans publicité"
          description="Le Studio n’intègre ni publicité, ni mesure d’audience, ni traceur marketing."
        />
        <SummaryCard
          icon={Cloud}
          title="Services à la demande"
          description="Google Drive et le formulaire de feedback ne sont contactés qu’après une action volontaire."
        />
      </section>

      <div className="grid gap-6">
        <LegalSection id="mentions-legales" icon={Scale} title="Mentions légales">
          <div className="grid gap-4 md:grid-cols-2">
            <LegalCard title="Édition et publication">
              <Definition label="Site">
                <a className={linkClass} href={LEGAL_INFORMATION.siteUrl} target="_blank" rel="noreferrer">
                  {LEGAL_INFORMATION.siteUrl.replace("https://", "")}
                  <ExternalLink className="size-3" />
                </a>
              </Definition>
              <Definition label="Éditeur">{LEGAL_INFORMATION.publisherName}</Definition>
              <Definition label="Qualité">{LEGAL_INFORMATION.publisherStatus}</Definition>
              <Definition label="Directeur de la publication">{LEGAL_INFORMATION.publicationDirector}</Definition>
              <Definition label="Contact">
                <a className={linkClass} href={`mailto:${LEGAL_INFORMATION.contactEmail}`}>
                  {LEGAL_INFORMATION.contactEmail}
                </a>
              </Definition>
              <p className="mt-4 text-xs leading-5 text-[#77717f]">
                L’éditeur utilise un pseudonyme dans le cadre de cette publication non professionnelle et doit maintenir auprès de l’hébergeur des informations permettant son identification.
              </p>
            </LegalCard>

            <LegalCard title="Hébergement et nom de domaine">
              <Definition label="Hébergeur">{LEGAL_INFORMATION.host.name}</Definition>
              <Definition label="Adresse">{LEGAL_INFORMATION.host.address}</Definition>
              <Definition label="Contact">
                <a className={linkClass} href={LEGAL_INFORMATION.host.contactUrl} target="_blank" rel="noreferrer">
                  Support GitHub <ExternalLink className="size-3" />
                </a>
              </Definition>
              <div className="my-4 h-px bg-white/7" />
              <Definition label="Nom de domaine">{LEGAL_INFORMATION.domainRegistrar.name}</Definition>
              <Definition label="Adresse">{LEGAL_INFORMATION.domainRegistrar.address}</Definition>
              <p className="mt-4 text-xs leading-5 text-[#77717f]">
                OVH gère l’enregistrement du domaine. L’hébergement du site est assuré par GitHub Pages.
              </p>
            </LegalCard>
          </div>

          <LegalCard title="Propriété intellectuelle">
            <p>
              L’interface, le nom, les éléments graphiques et le code du Studio sont protégés par les règles applicables à la propriété intellectuelle, sous réserve des licences expressément indiquées dans le dépôt du projet.
            </p>
            <p>
              Vous restez titulaire de vos textes, images, personnages et autres créations. Leur utilisation locale par le Studio n’accorde aucun droit sur ces contenus à l’éditeur.
            </p>
            <p>
              L’espace d’écriture intègre {LEGAL_INFORMATION.superDoc.name}, distribué sous licence {LEGAL_INFORMATION.superDoc.license}. Cette version du Studio est fournie sous la même licence, avec son code source public. L’intégration fonctionne dans le navigateur et n’envoie pas le contenu des manuscrits à SuperDoc.
            </p>
            <div className="flex flex-wrap gap-4 pt-1 text-xs">
              <a className={linkClass} href={LEGAL_INFORMATION.sourceUrl} target="_blank" rel="noreferrer">
                Code source du Studio <ExternalLink className="size-3" />
              </a>
              <a className={linkClass} href={LEGAL_INFORMATION.superDoc.sourceUrl} target="_blank" rel="noreferrer">
                Source et licence de SuperDoc <ExternalLink className="size-3" />
              </a>
            </div>
          </LegalCard>
        </LegalSection>

        <LegalSection id="confidentialite" icon={ShieldCheck} title="Confidentialité et données personnelles">
          <LegalCard title="Données conservées sur votre appareil">
            <p>
              Le Studio est une application « local-first ». Les projets, pages, personnages, images, polices et paramètres sont enregistrés dans IndexedDB. Le cache du navigateur conserve les fichiers techniques nécessaires au fonctionnement hors connexion.
            </p>
            <p>
              Ces contenus ne sont pas envoyés à l’éditeur. Ils restent sur l’appareil jusqu’à leur suppression dans le Studio ou l’effacement des données du site depuis le navigateur. Un fichier <code>.efs</code> ou <code>.zip</code> n’est créé et téléchargé qu’à votre demande.
            </p>
          </LegalCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <LegalCard title="Feedback par e-mail">
              <p>
                Lorsque vous envoyez volontairement un feedback, le nom saisi, le type, le titre, le message et l’adresse de la page courante sont transmis à FormSubmit, puis à {LEGAL_INFORMATION.contactEmail}. Aucun projet ni fichier n’est joint automatiquement.
              </p>
              <Definition label="Finalité">Recevoir, traiter et répondre aux signalements et suggestions.</Definition>
              <Definition label="Base légale">Votre consentement explicite au moment de l’envoi.</Definition>
              <Definition label="Destinataires">L’éditeur et FormSubmit comme intermédiaire technique.</Definition>
              <Definition label="Conservation par l’éditeur">{LEGAL_INFORMATION.feedbackRetention}.</Definition>
              <a className={`${linkClass} mt-3 text-xs`} href="https://formsubmit.co/privacy.pdf" target="_blank" rel="noreferrer">
                Politique de FormSubmit <ExternalLink className="size-3" />
              </a>
            </LegalCard>

            <LegalCard title="Sauvegarde Google Drive">
              <p>
                Si vous activez Google Drive, le navigateur communique directement avec Google. Le Studio demande l’autorisation <code>drive.file</code>, limitée aux fichiers créés ou choisis avec l’application. Le jeton d’accès reste en mémoire pendant la session.
              </p>
              <p>
                Le fichier de sauvegarde et sa durée de conservation dépendent alors de votre compte Google. Les identifiants techniques configurés pour Drive peuvent être conservés dans les paramètres locaux et dans vos sauvegardes.
              </p>
              <a className={`${linkClass} mt-3 text-xs`} href="https://policies.google.com/privacy?hl=fr" target="_blank" rel="noreferrer">
                Règles de confidentialité de Google <ExternalLink className="size-3" />
              </a>
            </LegalCard>
          </div>

          <LegalCard title="Hébergement, cookies et traceurs">
            <p>
              Le Studio ne dépose pas de cookie publicitaire ou analytique et n’intègre pas de module social. Les stockages locaux sont utilisés pour fournir les fonctions demandées : récupération, préférences et fonctionnement hors connexion.
            </p>
            <p>
              GitHub peut traiter des données techniques de connexion, notamment l’adresse IP, la date de la requête, l’appareil et les pages consultées, selon sa propre politique. L’éditeur du Studio n’a pas accès aux journaux techniques de GitHub Pages.
            </p>
            <a className={`${linkClass} mt-3 text-xs`} href="https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">
              Déclaration de confidentialité de GitHub <ExternalLink className="size-3" />
            </a>
          </LegalCard>

          <LegalCard title="Vos droits">
            <p>
              Pour les données reçues par feedback, vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou le retrait de votre consentement en écrivant à
              {" "}
              <a className={linkClass} href={`mailto:${LEGAL_INFORMATION.contactEmail}`}>
                {LEGAL_INFORMATION.contactEmail}
              </a>.
            </p>
            <p>
              Vous pouvez supprimer les données locales directement depuis le Studio ou les réglages du navigateur. Vous pouvez également saisir la CNIL si vous estimez que vos droits ne sont pas respectés.
            </p>
            <a className={`${linkClass} mt-3 text-xs`} href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">
              Déposer une plainte auprès de la CNIL <ExternalLink className="size-3" />
            </a>
          </LegalCard>
        </LegalSection>

        <LegalSection id="conditions-utilisation" icon={FileText} title="Conditions d’utilisation">
          <div className="grid gap-4 md:grid-cols-2">
            <LegalCard title="Objet et accès">
              <p>
                {LEGAL_INFORMATION.siteName} est un outil gratuit en cours de développement, fourni sans compte utilisateur ni abonnement. Ses fonctions peuvent évoluer, être corrigées ou être temporairement indisponibles.
              </p>
              <p>
                L’utilisation du Studio doit respecter la loi et les droits des tiers. Vous devez notamment disposer des droits nécessaires sur les textes, images et polices que vous importez.
              </p>
            </LegalCard>

            <LegalCard title="Sauvegardes et disponibilité">
              <p>
                La copie automatique du navigateur est une aide à la récupération, pas une sauvegarde garantie. Les données locales peuvent disparaître après un nettoyage du navigateur, un changement d’appareil ou une panne.
              </p>
              <p>
                Il vous appartient de télécharger régulièrement un fichier <code>.efs</code> ou <code>.zip</code> et d’en conserver des copies. Les services GitHub, Google Drive et FormSubmit restent soumis à leurs propres disponibilités et conditions.
              </p>
            </LegalCard>
          </div>

          <div className="flex gap-3 rounded-2xl border border-[#e6b35f]/20 bg-[#e6b35f]/6 p-4 text-xs leading-5 text-[#d1b77e]">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Rien dans ces conditions ne limite les droits impératifs accordés par la loi. Le droit français s’applique. En cas de difficulté, contactez d’abord l’éditeur afin de rechercher une solution amiable.
            </p>
          </div>
        </LegalSection>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-5 text-xs text-[#77717f]">
        <span>© {new Date().getFullYear()} {LEGAL_INFORMATION.publisherName} — {LEGAL_INFORMATION.siteName}</span>
        <a className={linkClass} href={`mailto:${LEGAL_INFORMATION.contactEmail}`}>
          <Mail className="size-3" /> Contact
        </a>
      </footer>
    </div>
  );

  if (compact) {
    return <div className="max-h-[72svh] overflow-y-auto pr-1 sm:pr-3">{content}</div>;
  }

  return <main className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">{content}</main>;
}

function SummaryCard({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-[#131218] p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-[#ef4f5f]/10 text-[#ef6977]">
        <Icon className="size-4" />
      </span>
      <h2 className="mt-3 text-sm font-semibold text-white">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[#8f8996]">{description}</p>
    </article>
  );
}

function LegalSection({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-7">
      <div className="mb-6 flex items-center gap-3 border-b border-white/7 pb-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ef4f5f]/10 text-[#ef6977]">
          <Icon className="size-5" />
        </span>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function LegalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-white/7 bg-black/15 p-4 text-sm leading-6 text-[#aaa4b4] sm:p-5 [&>p+p]:mt-3">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
        <Copyright className="size-4 text-[#ef6977]" /> {title}
      </h3>
      {children}
    </article>
  );
}

function Definition({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1 sm:grid-cols-[150px_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-[#77717f]">{label}</dt>
      <dd className="min-w-0 text-sm text-[#c8c2cf]">{children}</dd>
    </div>
  );
}
