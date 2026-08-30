import { decodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { joinPath } from "../../../base/common/resources.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { IImageResizeService } from "../common/imageResizeService.js";
class ImageResizeService {
  /**
   * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
   * https://platform.openai.com/docs/guides/vision#calculating-costs
   * @param data - The UInt8Array string of the image to resize.
   * @returns A promise that resolves to the UInt8Array string of the resized image.
   */
  async resizeImage(data, mimeType) {
    const isGif = mimeType === "image/gif";
    if (typeof data === "string") {
      data = this.convertStringToUInt8Array(data);
    }
    return new Promise((resolve, reject) => {
      const blob = new Blob([data], { type: mimeType });
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if ((width <= 768 || height <= 768) && !isGif) {
          resolve(data);
          return;
        }
        if (width > 2048 || height > 2048) {
          const scaleFactor2 = 2048 / Math.max(width, height);
          width = Math.round(width * scaleFactor2);
          height = Math.round(height * scaleFactor2);
        }
        const scaleFactor = 768 / Math.min(width, height);
        width = Math.round(width * scaleFactor);
        height = Math.round(height * scaleFactor);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const jpegTypes = ["image/jpeg", "image/jpg"];
          const outputMimeType = mimeType && jpegTypes.includes(mimeType) ? "image/jpeg" : "image/png";
          canvas.toBlob((blob2) => {
            if (blob2) {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(new Uint8Array(reader.result));
              };
              reader.onerror = (error) => reject(error);
              reader.readAsArrayBuffer(blob2);
            } else {
              reject(new Error("Failed to create blob from canvas"));
            }
          }, outputMimeType);
        } else {
          reject(new Error("Failed to get canvas context"));
        }
      };
      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      };
    });
  }
  convertStringToUInt8Array(data) {
    const base64Data = data.includes(",") ? data.split(",")[1] : data;
    if (this.isValidBase64(base64Data)) {
      return decodeBase64(base64Data).buffer;
    }
    return new TextEncoder().encode(data);
  }
  // Only used for URLs
  convertUint8ArrayToString(data) {
    try {
      const decoder = new TextDecoder();
      const decodedString = decoder.decode(data);
      return decodedString;
    } catch {
      return "";
    }
  }
  isValidBase64(str) {
    try {
      decodeBase64(str);
      return true;
    } catch {
      return false;
    }
  }
  async createFileForMedia(fileService, imagesFolder, dataTransfer, mimeType) {
    const exists = await fileService.exists(imagesFolder);
    if (!exists) {
      await fileService.createFolder(imagesFolder);
    }
    const ext = mimeType.split("/")[1] || "png";
    const filename = `image-${Date.now()}.${ext}`;
    const fileUri = joinPath(imagesFolder, filename);
    const buffer = VSBuffer.wrap(dataTransfer);
    await fileService.writeFile(fileUri, buffer);
    return fileUri;
  }
  async cleanupOldImages(fileService, logService, imagesFolder) {
    const exists = await fileService.exists(imagesFolder);
    if (!exists) {
      return;
    }
    const duration = 7 * 24 * 60 * 60 * 1e3;
    const files = await fileService.resolve(imagesFolder);
    if (!files.children) {
      return;
    }
    await Promise.all(files.children.map(async (file) => {
      try {
        const timestamp = this.getTimestampFromFilename(file.name);
        if (timestamp && Date.now() - timestamp > duration) {
          await fileService.del(file.resource);
        }
      } catch (err) {
        logService.error("Failed to clean up old images", err);
      }
    }));
  }
  getTimestampFromFilename(filename) {
    const match = filename.match(/image-(\d+)\./);
    if (match) {
      return parseInt(match[1], 10);
    }
    return void 0;
  }
}
registerSingleton(IImageResizeService, ImageResizeService, InstantiationType.Delayed);
export {
  ImageResizeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcaW1hZ2VSZXNpemVcXGJyb3dzZXJcXGltYWdlUmVzaXplU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUltYWdlUmVzaXplU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9pbWFnZVJlc2l6ZVNlcnZpY2UuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBJbWFnZVJlc2l6ZVNlcnZpY2UgaW1wbGVtZW50cyBJSW1hZ2VSZXNpemVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmVzaXplcyBhbiBpbWFnZSBwcm92aWRlZCBhcyBhIFVJbnQ4QXJyYXkgc3RyaW5nLiBSZXNpemluZyBpcyBiYXNlZCBvbiBPcGVuIEFJJ3MgYWxnb3JpdGhtIGZvciB0b2tlbnppbmcgaW1hZ2VzLlxuXHQgKiBodHRwczovL3BsYXRmb3JtLm9wZW5haS5jb20vZG9jcy9ndWlkZXMvdmlzaW9uI2NhbGN1bGF0aW5nLWNvc3RzXG5cdCAqIEBwYXJhbSBkYXRhIC0gVGhlIFVJbnQ4QXJyYXkgc3RyaW5nIG9mIHRoZSBpbWFnZSB0byByZXNpemUuXG5cdCAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBVSW50OEFycmF5IHN0cmluZyBvZiB0aGUgcmVzaXplZCBpbWFnZS5cblx0ICovXG5cblx0YXN5bmMgcmVzaXplSW1hZ2UoZGF0YTogVWludDhBcnJheSB8IHN0cmluZywgbWltZVR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCBpc0dpZiA9IG1pbWVUeXBlID09PSAnaW1hZ2UvZ2lmJztcblxuXHRcdGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGRhdGEgPSB0aGlzLmNvbnZlcnRTdHJpbmdUb1VJbnQ4QXJyYXkoZGF0YSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbZGF0YSBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPl0sIHsgdHlwZTogbWltZVR5cGUgfSk7XG5cdFx0XHRjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcblx0XHRcdGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdFx0XHRpbWcuc3JjID0gdXJsO1xuXG5cdFx0XHRpbWcub25sb2FkID0gKCkgPT4ge1xuXHRcdFx0XHRVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG5cdFx0XHRcdGxldCB7IHdpZHRoLCBoZWlnaHQgfSA9IGltZztcblxuXHRcdFx0XHRpZiAoKHdpZHRoIDw9IDc2OCB8fCBoZWlnaHQgPD0gNzY4KSAmJiAhaXNHaWYpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGRhdGEpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENhbGN1bGF0ZSB0aGUgbmV3IGRpbWVuc2lvbnMgd2hpbGUgbWFpbnRhaW5pbmcgdGhlIGFzcGVjdCByYXRpb1xuXHRcdFx0XHRpZiAod2lkdGggPiAyMDQ4IHx8IGhlaWdodCA+IDIwNDgpIHtcblx0XHRcdFx0XHRjb25zdCBzY2FsZUZhY3RvciA9IDIwNDggLyBNYXRoLm1heCh3aWR0aCwgaGVpZ2h0KTtcblx0XHRcdFx0XHR3aWR0aCA9IE1hdGgucm91bmQod2lkdGggKiBzY2FsZUZhY3Rvcik7XG5cdFx0XHRcdFx0aGVpZ2h0ID0gTWF0aC5yb3VuZChoZWlnaHQgKiBzY2FsZUZhY3Rvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzY2FsZUZhY3RvciA9IDc2OCAvIE1hdGgubWluKHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0XHR3aWR0aCA9IE1hdGgucm91bmQod2lkdGggKiBzY2FsZUZhY3Rvcik7XG5cdFx0XHRcdGhlaWdodCA9IE1hdGgucm91bmQoaGVpZ2h0ICogc2NhbGVGYWN0b3IpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdFx0XHRjYW52YXMud2lkdGggPSB3aWR0aDtcblx0XHRcdFx0Y2FudmFzLmhlaWdodCA9IGhlaWdodDtcblx0XHRcdFx0Y29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0XHRcdGlmIChjdHgpIHtcblx0XHRcdFx0XHRjdHguZHJhd0ltYWdlKGltZywgMCwgMCwgd2lkdGgsIGhlaWdodCk7XG5cblx0XHRcdFx0XHRjb25zdCBqcGVnVHlwZXMgPSBbJ2ltYWdlL2pwZWcnLCAnaW1hZ2UvanBnJ107XG5cdFx0XHRcdFx0Y29uc3Qgb3V0cHV0TWltZVR5cGUgPSBtaW1lVHlwZSAmJiBqcGVnVHlwZXMuaW5jbHVkZXMobWltZVR5cGUpID8gJ2ltYWdlL2pwZWcnIDogJ2ltYWdlL3BuZyc7XG5cblx0XHRcdFx0XHRjYW52YXMudG9CbG9iKGJsb2IgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGJsb2IpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblx0XHRcdFx0XHRcdFx0cmVhZGVyLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKG5ldyBVaW50OEFycmF5KHJlYWRlci5yZXN1bHQgYXMgQXJyYXlCdWZmZXIpKTtcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0cmVhZGVyLm9uZXJyb3IgPSAoZXJyb3IpID0+IHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihibG9iKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgYmxvYiBmcm9tIGNhbnZhcycpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCBvdXRwdXRNaW1lVHlwZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBjYW52YXMgY29udGV4dCcpKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGltZy5vbmVycm9yID0gKGVycm9yKSA9PiB7XG5cdFx0XHRcdFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcblx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRjb252ZXJ0U3RyaW5nVG9VSW50OEFycmF5KGRhdGE6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuXHRcdGNvbnN0IGJhc2U2NERhdGEgPSBkYXRhLmluY2x1ZGVzKCcsJykgPyBkYXRhLnNwbGl0KCcsJylbMV0gOiBkYXRhO1xuXHRcdGlmICh0aGlzLmlzVmFsaWRCYXNlNjQoYmFzZTY0RGF0YSkpIHtcblx0XHRcdHJldHVybiBkZWNvZGVCYXNlNjQoYmFzZTY0RGF0YSkuYnVmZmVyO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGRhdGEpO1xuXHR9XG5cblx0Ly8gT25seSB1c2VkIGZvciBVUkxzXG5cdGNvbnZlcnRVaW50OEFycmF5VG9TdHJpbmcoZGF0YTogVWludDhBcnJheSk6IHN0cmluZyB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcblx0XHRcdGNvbnN0IGRlY29kZWRTdHJpbmcgPSBkZWNvZGVyLmRlY29kZShkYXRhKTtcblx0XHRcdHJldHVybiBkZWNvZGVkU3RyaW5nO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdGlzVmFsaWRCYXNlNjQoc3RyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0ZGVjb2RlQmFzZTY0KHN0cik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjcmVhdGVGaWxlRm9yTWVkaWEoZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgaW1hZ2VzRm9sZGVyOiBVUkksIGRhdGFUcmFuc2ZlcjogVWludDhBcnJheSwgbWltZVR5cGU6IHN0cmluZyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGltYWdlc0ZvbGRlcik7XG5cdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihpbWFnZXNGb2xkZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dCA9IG1pbWVUeXBlLnNwbGl0KCcvJylbMV0gfHwgJ3BuZyc7XG5cdFx0Y29uc3QgZmlsZW5hbWUgPSBgaW1hZ2UtJHtEYXRlLm5vdygpfS4ke2V4dH1gO1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBqb2luUGF0aChpbWFnZXNGb2xkZXIsIGZpbGVuYW1lKTtcblxuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLndyYXAoZGF0YVRyYW5zZmVyKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZmlsZVVyaSwgYnVmZmVyKTtcblxuXHRcdHJldHVybiBmaWxlVXJpO1xuXHR9XG5cblx0YXN5bmMgY2xlYW51cE9sZEltYWdlcyhmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgaW1hZ2VzRm9sZGVyOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoaW1hZ2VzRm9sZGVyKTtcblx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGR1cmF0aW9uID0gNyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDcgZGF5c1xuXHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShpbWFnZXNGb2xkZXIpO1xuXHRcdGlmICghZmlsZXMuY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChmaWxlcy5jaGlsZHJlbi5tYXAoYXN5bmMgKGZpbGUpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IHRoaXMuZ2V0VGltZXN0YW1wRnJvbUZpbGVuYW1lKGZpbGUubmFtZSk7XG5cdFx0XHRcdGlmICh0aW1lc3RhbXAgJiYgKERhdGUubm93KCkgLSB0aW1lc3RhbXAgPiBkdXJhdGlvbikpIHtcblx0XHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwoZmlsZS5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gY2xlYW4gdXAgb2xkIGltYWdlcycsIGVycik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0VGltZXN0YW1wRnJvbUZpbGVuYW1lKGZpbGVuYW1lOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hdGNoID0gZmlsZW5hbWUubWF0Y2goL2ltYWdlLShcXGQrKVxcLi8pO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHBhcnNlSW50KG1hdGNoWzFdLCAxMCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElJbWFnZVJlc2l6ZVNlcnZpY2UsIEltYWdlUmVzaXplU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLDJCQUEyQjtBQUc3QixNQUFNLG1CQUFrRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVzlELE1BQU0sWUFBWSxNQUEyQixVQUF3QztBQUNwRixVQUFNLFFBQVEsYUFBYTtBQUUzQixRQUFJLE9BQU8sU0FB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
