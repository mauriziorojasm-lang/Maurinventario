import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isGeneratorConfigured } from "./actions";
import { DescriptionGenerator } from "./generator";

export const metadata: Metadata = { title: "Generador de descripciones" };

export default async function DescriptionsPage() {
  await requireUser();
  // Solo se comprueba si existe la clave; no se llama a la IA al abrir la pantalla
  const configured = await isGeneratorConfigured();
  return (
    <>
      <PageHeader
        title="Generador de descripciones"
        description="Elige productos de tu inventario y crea el texto del anuncio para Wallapop, Vinted, eBay o Instagram. Solo lee tus productos: no cambia stock ni fichas."
      />
      {!configured && (
        <Notice tone="warn" className="mb-4" title="Falta la clave de la IA (GEMINI_API_KEY)">
          <p>Puedes preparar el anuncio, pero para generarlo hace falta una clave gratuita de Google Gemini:</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>
              Entra en <strong>aistudio.google.com</strong> con tu cuenta de Google → <strong>Get API key</strong> → <strong>Create API key</strong> y cópiala.
            </li>
            <li>
              En <strong>Vercel</strong> → proyecto MaurInventario → <strong>Settings → Environment Variables</strong>: nombre <code>GEMINI_API_KEY</code>,
              valor la clave.
            </li>
            <li>
              <strong>Deployments</strong> → el último → <strong>Redeploy</strong>.
            </li>
          </ol>
        </Notice>
      )}
      <DescriptionGenerator configured={configured} />
    </>
  );
}
