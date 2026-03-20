declare module "exif-parser" {
  interface ExifTags {
    [key: string]: unknown;
    Software?: string;
    ProcessingSoftware?: string;
    HostComputer?: string;
    Make?: string;
    Model?: string;
  }

  interface ExifParseResult {
    tags?: ExifTags;
  }

  interface ExifParserInstance {
    parse(): ExifParseResult;
  }

  interface ExifParserStatic {
    create(data: Uint8Array): ExifParserInstance;
  }

  const ExifParser: ExifParserStatic;
  export default ExifParser;
}

declare module "expo-video-thumbnails" {
  export function getThumbnailAsync(
    sourceFilename: string,
    options: { time?: number; quality?: number }
  ): Promise<{ uri: string; width?: number; height?: number }>;
}

declare module "jpeg-js" {
  interface DecodeOptions {
    useTArray?: boolean;
    formatAsRGBA?: boolean;
  }

  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8Array;
  }

  function decode(data: Uint8Array, options?: DecodeOptions): DecodedImage;

  const jpeg: {
    decode: typeof decode;
  };

  export default jpeg;
}
