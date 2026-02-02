import { trpc } from "./trpc";

/**
 * Upload an image file to the server and get a public URL
 * @param uri - Local file URI (e.g., from ImagePicker)
 * @returns Public URL of the uploaded image, or null if failed
 */
export async function uploadImage(uri: string): Promise<string | null> {
  try {
    // Read the file as base64
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = result.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Get the file extension from the URI
    const extension = uri.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = extension === "png" ? "image/png" : "image/jpeg";

    // Generate a unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `bug-report-${timestamp}-${randomStr}.${extension}`;

    // Call the server API to upload
    // Note: This requires a server endpoint for image upload
    // For now, we'll use a direct approach
    
    return null; // Will be implemented via server endpoint
  } catch (error) {
    console.error("Image upload error:", error);
    return null;
  }
}

/**
 * Upload image via server tRPC endpoint
 * This is the preferred method as it handles authentication
 */
export function useImageUpload() {
  const uploadMutation = trpc.storage.uploadImage.useMutation();

  const upload = async (uri: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const extension = uri.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = extension === "png" ? "image/png" : "image/jpeg";

      const result = await uploadMutation.mutateAsync({
        base64Data: base64,
        mimeType,
        folder: "bug-reports",
      });

      return result.url;
    } catch (error) {
      console.error("Image upload error:", error);
      return null;
    }
  };

  return {
    upload,
    isUploading: uploadMutation.isPending,
  };
}
