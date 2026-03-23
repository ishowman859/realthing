import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { enableScreens } from "react-native-screens";
import { Buffer } from "buffer";

global.Buffer = global.Buffer || Buffer;

// 네이티브 스크린 초기화 이슈로 즉시 종료되는 기기 완화(스택 네비게이션 미사용 프로젝트)
enableScreens(false);
