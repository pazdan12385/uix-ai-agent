import { GoogleGenAI, Type } from "@google/genai";

/* =========================
   TYPES
========================= */

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ReferenceAsset = {
  type: "image" | "html";
  data: string;
  name?: string;
};

export type GeneratedUI = {
  overview: {
    name: string;
    description: string;
    targetUsers: string[];
  };
  designSystem: {
    colors: {
      primary: string;
      secondary: string;
      background: string;
      surface: string;
      text: string;
      accent: string;
      muted: string;
      border: string;
    };
    radius: string;
    font: string;
  };
  screens: {
    id: string;
    name: string;
    purpose: string;
    markup: string;
    position?: { x: number; y: number };
  }[];
  connections?: {
    from: string;
    to: string;
    label: string;
  }[];
};

/* =========================
   PROMPT CONSTANTS
========================= */

const GENERATION_SYSTEM_PROMPT = `
You are an elite cross-platform UI/UX designer creating Dribbble-quality HTML for BOTH mobile and web using Tailwind CSS and CSS variables.

# CRITICAL NAVIGATION CONSISTENCY
In a real application, the Navigation (Bottom Bar, Sidebar, or Top Header) stays EXACTLY the same across screens.
1. SCAN existing screens (if provided) for their navigation HTML.
2. REPLICATE that navigation block IDENTICALLY in any new screens.
3. Update ONLY the "active" or "selected" state within the navigation.
4. Icons, labels, and order must be 100% consistent across the entire project.

# OUTPUT RULES
1. Output HTML ONLY – Start with <div, no markdown, no JS, no comments
2. No scripts, no canvas – SVG ONLY for charts
3. Images: Use https://i.pravatar.cc/150?u=NAME for avatars.
4. THEME VARIABLES: Use existing CSS variables (var(--background), etc).
5. User visual instructions override defaults.

# VISUAL STYLE
- Premium, glossy, modern (Dribbble style).
- Glassmorphism: bg-[var(--card)]/70 backdrop-blur-xl.
- Soft glow highlights.
- Gradients: bg-gradient-to-r from-[var(--primary)] to-[var(--accent)].


# FONT RULE (STRICT)
- designSystem.font MUST be a single font family name only.
- Example: "Inter"
- NEVER include fallbacks like ", sans-serif"
- Fallbacks are handled by CSS, not designSystem.

# IMAGE RULES (STRICT)
❌ DO NOT use via.placeholder.com
❌ DO NOT use placehold.it
❌ DO NOT use dummyimage.com

✅ Use ONLY:
- https://picsum.photos/seed/{unique}/{width}/{height}
- https://i.pravatar.cc/150?u=NAME (avatars only)
- https://images.unsplash.com (real photos)

If an image is required and no real asset is available:
Use: https://picsum.photos/seed/ui/{width}/{height}

# ROOT LAYOUT
- Root container: class="relative w-full min-h-screen bg-[var(--background)] flex flex-col lg:flex-row"
`;

const ANALYSIS_PROMPT = `
You are a Lead Cross-Platform UI/UX Designer.
Return JSON describing responsive screens.
# NAVIGATION RULES
- MOBILE: Floating bottom nav.
- WEB: Sidebar OR Topbar.
- Navigation structure MUST be identical across screens.
`;

/* =========================
   CORE AI CALLER
========================= */

async function callAI(
  systemInstruction: string,
  userPrompt: string,
  responseSchema: any,
  modelName: string,
  apiKey?: string,
  provider: "gemini" | "openrouter" = "gemini",
  referenceParts: any[] = []
): Promise<string> {
  // Logic: Use custom key if present. If not, fallback to default env key and default 'gemini' provider.
  const hasCustomKey = !!apiKey?.trim();
  const effectiveApiKey = hasCustomKey ? apiKey : process.env.API_KEY || "";
  const effectiveProvider = hasCustomKey ? provider : "gemini";

  // If falling back to default key, force a standard Gemini model to avoid provider mismatch errors
  let effectiveModel = modelName;
  if (!hasCustomKey) {
    if (effectiveModel.includes("/") || effectiveModel === "custom") {
      effectiveModel = "gemini-3-flash-preview";
    }
  }

  if (effectiveProvider === "openrouter") {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${effectiveApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter Error: ${err}`);
    }
    const json = await response.json();
    return json.choices[0].message.content;
  } else {
    // Gemini Provider
    const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
    const contentParts = [{ text: userPrompt }, ...referenceParts];

    const res = await ai.models.generateContent({
      model: effectiveModel,
      contents: { parts: contentParts },
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });
    return res.text || "";
  }
}

export async function generateProductArtifacts(
  prompt: string,
  theme: "light" | "dark",
  config: {
    architecture: "web" | "app";
    referenceAssets?: ReferenceAsset[];
    chatHistory?: ChatMessage[];
    existingScreens?: {
      name: string;
      purpose: string;
      markup: string;
      id: string;
    }[];
    model?: string;
    apiKey?: string;
    provider?: "gemini" | "openrouter";
  }
): Promise<GeneratedUI> {
  const modelName = config.model || "gemini-3-flash-preview";

  const systemInstruction = `
${ANALYSIS_PROMPT}
# DESIGN LANGUAGE & CODING RULES
${GENERATION_SYSTEM_PROMPT}
# UI THEME (STRICT)
The product UI MUST be rendered in ${theme.toUpperCase()} MODE.
- Do NOT mix light and dark styles
- Backgrounds, cards, text, borders must match this theme
- Assume users expect consistency

Theme: ${theme.toUpperCase()}
Architecture: ${config.architecture.toUpperCase()}.
# INCREMENTAL UPDATE
- Return ENTIRE project state (screens array).
# EXISTING SCREENS
${
  config.existingScreens
    ? config.existingScreens
        .map((s) => `SCREEN: ${s.name} (ID: ${s.id})\nMARKUP:\n${s.markup}`)
        .join("\n\n---\n\n")
    : "No existing screens."
}
# CHAT CONTEXT
${config.chatHistory
  ?.map((m) => `${m.role.toUpperCase()}: ${m.content}`)
  .join("\n")}
`;

  const userPrompt = `USER REQUEST: "${prompt}"`;

  const referenceParts: any[] = [];
  if (config.referenceAssets) {
    config.referenceAssets.forEach((asset) => {
      if (asset.type === "image") {
        referenceParts.push({
          inlineData: {
            mimeType: "image/png",
            data: asset.data.split(",")[1] || asset.data,
          },
        });
      }
    });
  }

  const responseText = await callAI(
    systemInstruction,
    userPrompt,
    {
      type: Type.OBJECT,
      properties: {
        overview: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            targetUsers: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["name", "description", "targetUsers"],
        },
        designSystem: {
          type: Type.OBJECT,
          properties: {
            colors: {
              type: Type.OBJECT,
              properties: {
                primary: { type: Type.STRING },
                secondary: { type: Type.STRING },
                background: { type: Type.STRING },
                surface: { type: Type.STRING },
                text: { type: Type.STRING },
                accent: { type: Type.STRING },
                muted: { type: Type.STRING },
                border: { type: Type.STRING },
              },
              required: [
                "primary",
                "secondary",
                "background",
                "surface",
                "text",
                "accent",
                "muted",
                "border",
              ],
            },
            radius: { type: Type.STRING },
            font: { type: Type.STRING },
          },
          required: ["colors", "radius", "font"],
        },
        screens: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              purpose: { type: Type.STRING },
              markup: { type: Type.STRING },
            },
            required: ["id", "name", "purpose", "markup"],
          },
        },
      },
      required: ["overview", "designSystem", "screens"],
    },
    modelName,
    config.apiKey,
    config.provider,
    referenceParts
  );

  return JSON.parse(responseText);
}

export async function generateNewScreen(
  purpose: string,
  designSystem: any,
  architecture: "web" | "app",
  projectContext: {
    overview: any;
    existingScreens: {
      name: string;
      purpose: string;
      markup: string;
      id: string;
    }[];
    chatHistory?: ChatMessage[];
  },
  model: string = "gemini-3-flash-preview",
  apiKey?: string,
  provider: "gemini" | "openrouter" = "gemini"
): Promise<{ name: string; markup: string }> {
  const systemInstruction = "Elite UI/UX engineer. Return JSON.";
  const userPrompt = `
Generate ONE new screen for "${projectContext.overview.name}".
PURPOSE: ${purpose}
# NAVIGATION CONSISTENCY
Identify and copy the navigation block from existing screens.
# EXISTING SCREENS
${projectContext.existingScreens
  .map((s) => `SCREEN: ${s.name}\n${s.markup}`)
  .join("\n\n---\n\n")}
# DESIGN SYSTEM
${JSON.stringify(designSystem)}
${GENERATION_SYSTEM_PROMPT}
`;

  const responseText = await callAI(
    systemInstruction,
    userPrompt,
    {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        markup: { type: Type.STRING },
      },
      required: ["name", "markup"],
    },
    model,
    apiKey,
    provider
  );

  return JSON.parse(responseText);
}

export async function modifyScreen(
  screenName: string,
  currentMarkup: string,
  instruction: string,
  designSystem: any,
  chatHistory?: ChatMessage[],
  model: string = "gemini-3-flash-preview",
  apiKey?: string,
  provider: "gemini" | "openrouter" = "gemini"
): Promise<{ name: string; markup: string }> {
  const systemInstruction = "Refine this screen while maintaining structure.";
  const userPrompt = `
Refine screen: ${screenName}
INSTRUCTION: ${instruction}
# CONTEXT
${chatHistory?.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}
${GENERATION_SYSTEM_PROMPT}
CURRENT MARKUP:
${currentMarkup}
`;

  const responseText = await callAI(
    systemInstruction,
    userPrompt,
    {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        markup: { type: Type.STRING },
      },
      required: ["name", "markup"],
    },
    model,
    apiKey,
    provider
  );

  return JSON.parse(responseText);
}

export async function refinePrompt(roughPrompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine app idea: "${roughPrompt}"`,
  });
  return response.text.trim();
}
