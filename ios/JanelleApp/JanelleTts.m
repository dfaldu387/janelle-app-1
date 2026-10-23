#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(JanelleTts, RCTEventEmitter)
RCT_EXTERN_METHOD(speak:(NSString *)text)
RCT_EXTERN_METHOD(stop)
@end
