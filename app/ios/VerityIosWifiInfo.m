#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VerityIosWifiInfo, NSObject)

RCT_EXTERN_METHOD(getCurrentWifiInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
