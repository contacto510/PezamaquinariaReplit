/**
 * Helper functions for uploading files to Replit Object Storage
 */
import { authenticatedFetch } from "./queryClient";

export async function uploadRepairImage(file: File, repairNumber: string, imageIndex: number): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('repairNumber', repairNumber);
    formData.append('imageIndex', imageIndex.toString());

    const response = await authenticatedFetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error uploading image: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url; // Return the URL to the uploaded image
  } catch (error) {
    console.error('Error uploading image to Object Storage:', error);
    throw error;
  }
}

export async function deleteRepairImage(imageUrl: string): Promise<void> {
  try {
    const response = await authenticatedFetch('/api/delete-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: imageUrl }),
    });

    if (!response.ok) {
      throw new Error(`Error deleting image: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error deleting image from Object Storage:', error);
    throw error;
  }
}
