#import <React/RCTBridgeModule.h>

// [각주1] Swift 메서드를 RN 브릿지에 노출하기 위한 Objective-C extern 선언입니다.
@interface RCT_EXTERN_MODULE(VerityHardwareSigner, NSObject)

RCT_EXTERN_METHOD(createOrGetSecureEnclaveKey:(NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sign:(NSString *)alias
                  payloadBase64:(NSString *)payloadBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPublicKey:(NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteKey:(NSString *)alias
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
