
import { GoogleGenAI, Type, Modality, VideoGenerationReferenceType } from "@google/genai";
import { StoryPanel, AnalysisResult, CharacterProfile, VisualStyle, AspectRatio, ImageResolution } from "../types";

// Helper to get AI instance. 
// CRITICAL: We create a new instance every time to ensure we pick up the latest selected key from window.aistudio if used.
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// 1. Script Analysis (Breakdown with Characters & Shot Types)
export const analyzeScript = async (scriptText: string): Promise<AnalysisResult> => {
  const ai = getAI();
  
  const prompt = `
    Analyze the following movie script. 
    1. Identify the main characters and provide a consistent visual description for each (age, hair, clothes, distinct features).
    2. Break the script down into a sequence of storyboard panels.
    3. For each panel, determine the best "Shot Type" (e.g., Close-up, Wide Shot, Over-the-Shoulder, Low Angle).
    
    Script:
    ${scriptText}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
            characters: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING },
                    },
                    required: ["name", "description"]
                }
            },
            panels: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    panelNumber: { type: Type.INTEGER },
                    visualDescription: { type: Type.STRING },
                    shotType: { type: Type.STRING },
                    dialogue: { type: Type.STRING },
                  },
                  required: ["panelNumber", "visualDescription", "shotType"],
                },
            }
        },
        required: ["characters", "panels"]
      },
    },
  });

  const text = response.text;
  if (!text) return { panels: [], characters: [] };
  
  try {
    const data = JSON.parse(text);
    const panels = data.panels.map((item: any, index: number) => ({
      ...item,
      id: `panel-${Date.now()}-${index}`,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isPlayingAudio: false,
    }));
    return { panels, characters: data.characters || [] };
  } catch (e) {
    console.error("Failed to parse script analysis", e);
    return { panels: [], characters: [] };
  }
};

// 2. Image Generation with Styles, Consistency, and Resolution
export const generatePanelImage = async (
    panel: StoryPanel, 
    style: VisualStyle, 
    ratio: AspectRatio,
    characters: CharacterProfile[],
    resolution?: ImageResolution
): Promise<string | null> => {
  const ai = getAI();
  
  let characterContext = "";
  characters.forEach(char => {
      if (panel.visualDescription.includes(char.name) || panel.dialogue?.includes(char.name)) {
          characterContext += `${char.name} looks like: ${char.description}. `;
      }
  });

  const fullPrompt = `
    Style: ${style}. 
    Shot Type: ${panel.shotType || "Cinematic Shot"}.
    Scene Description: ${panel.visualDescription}.
    ${characterContext ? `Character Details: ${characterContext}` : ''}
    Highly detailed, professional storyboard, cinematic lighting.
  `;

  // Use Pro model if resolution is specified (implies "Pro" mode), otherwise use fast model
  const model = resolution ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: fullPrompt }],
      },
      config: {
        imageConfig: {
            aspectRatio: ratio,
            // Only add imageSize if using the Pro model
            ...(resolution ? { imageSize: resolution } : {})
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e) {
    console.error("Image generation failed", e);
    return null;
  }
};

// 3. Image Editing (Gemini 2.5 Flash Image)
export const editPanelImage = async (
  imageBase64: string,
  editPrompt: string
): Promise<string | null> => {
  const ai = getAI();
  
  // Strip data prefix if present for clean base64
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeType = imageBase64.split(';')[0].split(':')[1] || 'image/png';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          { text: editPrompt }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;

  } catch (e) {
    console.error("Image edit failed", e);
    return null;
  }
};

// 3.5 Outpainting (Expanding Image)
export type OutpaintDirection = 'up' | 'down' | 'left' | 'right' | 'zoom-out';

export const outpaintPanelImage = async (
  imageBase64: string,
  direction: OutpaintDirection
): Promise<string | null> => {
  const ai = getAI();

  // 1. Process Image on Canvas
  const processImage = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject("No context"); return; }

        let newWidth = img.width;
        let newHeight = img.height;
        let dx = 0;
        let dy = 0;

        const EXPANSION_FACTOR = 0.5; // Expand by 50%

        switch (direction) {
          case 'left':
            newWidth = img.width * (1 + EXPANSION_FACTOR);
            dx = img.width * EXPANSION_FACTOR; // Place original on the right
            break;
          case 'right':
            newWidth = img.width * (1 + EXPANSION_FACTOR);
            dx = 0; // Place original on the left
            break;
          case 'up':
            newHeight = img.height * (1 + EXPANSION_FACTOR);
            dy = img.height * EXPANSION_FACTOR; // Place original on bottom
            break;
          case 'down':
            newHeight = img.height * (1 + EXPANSION_FACTOR);
            dy = 0; // Place original on top
            break;
          case 'zoom-out':
            newWidth = img.width * 1.5;
            newHeight = img.height * 1.5;
            dx = (newWidth - img.width) / 2;
            dy = (newHeight - img.height) / 2;
            break;
        }

        canvas.width = newWidth;
        canvas.height = newHeight;

        // Draw the image on the new canvas
        ctx.drawImage(img, dx, dy);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = imageBase64;
    });
  };

  try {
    const processedBase64 = await processImage();
    const base64Data = processedBase64.split(',')[1];
    
    // 2. Send to Gemini
    const prompt = `
      Outpainting task: The provided image has empty space added to the ${direction}. 
      Seamlessly fill in this empty space to expand the scene. 
      Match the existing art style, lighting, and context perfectly. 
      Do not change the original content, only extend it.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/png'
            }
          },
          { text: prompt }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;

  } catch (e) {
    console.error("Outpainting failed", e);
    return null;
  }
};

// 4. Video Generation (Veo)
export const generateVideoFromImage = async (
  imageBase64: string,
  aspectRatio: AspectRatio
): Promise<string | null> => {
  const ai = getAI();

  // Veo only supports 16:9 or 9:16. Map others to 16:9 default.
  const veoAspectRatio = (aspectRatio === '9:16') ? '9:16' : '16:9';
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeType = imageBase64.split(';')[0].split(':')[1] || 'image/png';

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      image: {
        imageBytes: base64Data,
        mimeType: mimeType,
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: veoAspectRatio
      }
    });

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5s poll
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (videoUri) {
      // Append API Key for fetching the actual content
      return `${videoUri}&key=${process.env.API_KEY}`;
    }
    return null;

  } catch (e) {
    console.error("Video generation failed", e);
    return null;
  }
};

// 5. Animatic Generation (Veo with Reference Images)
export const generateAnimatic = async (
    panels: StoryPanel[],
    characters: CharacterProfile[] = []
): Promise<string | null> => {
    const ai = getAI();

    // Veo allows up to 3 reference images in 'veo-3.1-generate-preview'
    // We filter for panels that have images, and take the first 3.
    const validPanels = panels.filter(p => p.imageUrl).slice(0, 3);
    
    if (validPanels.length < 2) return null;

    const referenceImagesPayload = [];
    
    // Construct a rich prompt with character context for better consistency
    let prompt = "A continuous cinematic video sequence. ";
    
    const characterContext = characters.map(c => `${c.name}: ${c.description}`).join('. ');
    if (characterContext) {
        prompt += `Characters details: ${characterContext}. `;
    }

    for (let i = 0; i < validPanels.length; i++) {
        const p = validPanels[i];
        if (!p.imageUrl) continue;

        // Ensure clean base64
        const base64Data = p.imageUrl.split(',')[1] || p.imageUrl;
        const mimeType = p.imageUrl.includes(';') ? p.imageUrl.split(';')[0].split(':')[1] : 'image/png';

        referenceImagesPayload.push({
            image: {
                imageBytes: base64Data,
                mimeType: mimeType
            },
            referenceType: VideoGenerationReferenceType.ASSET
        });

        prompt += `Scene ${i + 1}: ${p.visualDescription}. `;
        
        // Add transition instruction if it exists and isn't the last panel
        if (p.transition && p.transition !== 'None' && i < validPanels.length - 1) {
            prompt += `Transition to next scene using ${p.transition} effect. `;
        }
    }

    prompt += "Smooth motion, high quality render, consistent character appearance between shots.";

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                referenceImages: referenceImagesPayload,
                resolution: '720p',
                aspectRatio: '16:9' // Strict requirement for ref images
            }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({operation: operation});
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (videoUri) {
            return `${videoUri}&key=${process.env.API_KEY}`;
        }
        return null;

    } catch (e) {
        console.error("Animatic generation failed", e);
        return null;
    }
};

// 6. Text to Speech
export const generateSpeech = async (text: string): Promise<ArrayBuffer | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, narrative voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        // Decode base64 to ArrayBuffer
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    return null;
  } catch (e) {
    console.error("TTS failed", e);
    return null;
  }
};

// 7. Research (Google Search Grounding)
export const searchResearch = async (query: string) => {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: query,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });
        
        const text = response.text || "No results found.";
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        const sources = groundingChunks
            .map((chunk: any) => chunk.web ? { title: chunk.web.title, url: chunk.web.uri } : null)
            .filter(Boolean);

        return { text, sources };
    } catch (e) {
        console.error("Search failed", e);
        throw e;
    }
};
