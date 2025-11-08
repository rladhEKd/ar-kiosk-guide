// 1. 설정: 인식할 키워드를 이곳에 추가하거나 수정하세요.
const TARGET_WORDS = ['버거', '음료', '주문', '결제'];

// ===== 주문 단계(state) & 주문 정보 =====
const STEPS = {
    IDLE: 'IDLE',                 // 아무 것도 안 하는 기본 상태
    MENU_CATEGORY: 'MENU_CATEGORY', // '버거' 탭 선택 단계
    MENU_ITEM: 'MENU_ITEM',       // '불고기버거' 같은 구체 메뉴 선택
    SET_OR_SINGLE: 'SET_OR_SINGLE', // 단품/세트 선택
    DESSERT: 'DESSERT',           // 디저트 선택
    DRINK: 'DRINK',               // 음료 선택
    CONFIRM: 'CONFIRM',           // 최종 확인
};

let currentStep = STEPS.IDLE;

const order = {
    menu: null,    // 예: '불고기버거'
    isSet: null,   // true=세트, false=단품, null=미정
    dessert: null, // 예: '감자튀김'
    drink: null,   // 예: '콜라'
};

// --- 이하 코드는 가급적 수정하지 마세요. ---

// 2. HTML 요소 가져오기
const video = document.getElementById('video');
const cameraButton = document.getElementById('cameraButton');
const scanButton = document.getElementById('scanButton');
const ocrOutput = document.getElementById('ocr-output');
const arOverlay = document.getElementById('ar-overlay');

let worker;
let stream;

// 3. Tesseract.js 초기화
async function initializeTesseract() {
    ocrOutput.textContent = 'OCR 엔진을 로딩 중입니다...';
    try {
        worker = await Tesseract.createWorker('kor');
        ocrOutput.textContent = 'OCR 엔진 로딩 완료. 카메라를 켜고 스캔 버튼을 누르세요.';
    } catch (error) {
        console.error('Tesseract.js v5 초기화 실패:', error);
        ocrOutput.textContent = 'OCR 엔진 로딩에 실패했습니다. 인터넷 연결을 확인해주세요.';
    }
}
initializeTesseract();

// 4. 카메라 켜기 버튼 이벤트 리스너
cameraButton.addEventListener('click', async () => {
    if (stream) {
        // 카메라 끄기
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;
        cameraButton.textContent = '카메라 켜기';
        scanButton.style.display = 'none';
        arOverlay.innerHTML = '';
        ocrOutput.textContent = '카메라가 꺼졌습니다.';
        return;
    }

    // 카메라 켜기
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream;
            video.play();
            cameraButton.textContent = '카메라 끄기';
            scanButton.style.display = 'inline-block';
            ocrOutput.textContent = '카메라가 켜졌습니다. 화면을 맞추고 스캔 버튼을 누르세요.';
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
        }
    } else {
        alert('이 브라우저에서는 카메라 접근을 지원하지 않습니다.');
    }
});

// 5. 스캔 버튼 이벤트 리스너
scanButton.addEventListener('click', recognizeText);


// 6. 텍스트 인식 함수
async function recognizeText() {
    if (!worker) {
        alert('OCR 엔진이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    if (!stream) {
        alert('카메라가 켜져 있지 않습니다.');
        return;
    }

    ocrOutput.textContent = '텍스트를 인식 중입니다...';

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    // 1. 이미지 전처리 시작
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // 흑백 변환 (Luminosity-preserving)
        const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = avg; // red
        data[i + 1] = avg; // green
        data[i + 2] = avg; // blue
    }
    context.putImageData(imageData, 0, 0);
    // 이미지 전처리 끝

    const { data: { text, words } } = await worker.recognize(canvas);
    ocrOutput.textContent = `인식된 텍스트: ${text}`;

    // 이전 AR 오버레이 지우기
    arOverlay.innerHTML = '';

    // 인식된 단어 위에 AR 화살표 표시
    words.forEach(word => {
        if (TARGET_WORDS.some(target => word.text.includes(target))) {
            const div = document.createElement('div');
            div.className = 'ar-arrow';
            div.style.position = 'absolute';
            // Bbox 좌표를 비디오 크기에 맞게 스케일링
            const scaleX = video.clientWidth / video.videoWidth;
            const scaleY = video.clientHeight / video.videoHeight;
            div.style.left = `${word.bbox.x0 * scaleX}px`;
            div.style.top = `${word.bbox.y0 * scaleY}px`;
            div.style.width = `${(word.bbox.x1 - word.bbox.x0) * scaleX}px`;
            div.style.height = `${(word.bbox.y1 - word.bbox.y0) * scaleY}px`;
            div.style.border = '2px solid red';
            div.title = word.text; // 마우스를 올리면 단어 표시
            arOverlay.appendChild(div);
        }
    });
}

// 7. 음성 인식 기능
const voiceButton = document.getElementById('voiceButton');
const voiceOutput = document.getElementById('voice-output');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR'; // 언어 설정: 한국어
    recognition.continuous = false; // 연속 인식 비활성화
    recognition.interimResults = false; // 중간 결과 비활성화

    voiceButton.addEventListener('click', () => {
        if (voiceButton.textContent === '음성인식 시작') {
            try {
                recognition.start();
            } catch(e) {
                voiceOutput.textContent = '오류: 이미 인식이 진행 중입니다.';
            }
        } else {
            recognition.stop();
        }
    });

    recognition.onstart = () => {
        voiceButton.textContent = '음성인식 중...';
        voiceOutput.textContent = '말씀하세요...';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        voiceOutput.textContent = transcript;
    
        // 인식된 문장을 주문 처리 로직으로 넘김
        handleOrderIntent(transcript);
    };

    recognition.onend = () => {
        voiceButton.textContent = '음성인식 시작';
    };

    // === 주문 의도 분석 함수 ===
    function handleOrderIntent(text) {
        // 공백 제거 (예: "불고기버거 세트 하나" → "불고기버거세트하나")
        const compact = text.replace(/\s+/g, '');

        // 1) 메뉴 감지
        let detectedMenu = null;
        if (compact.includes('불고기')) detectedMenu = '불고기버거';
        else if (compact.includes('치즈')) detectedMenu = '치즈버거';
        else if (compact.includes('새우')) detectedMenu = '새우버거';

        // 2) 세트/단품 감지
        let detectedIsSet = null;
        if (compact.includes('세트')) detectedIsSet = true;
        else if (compact.includes('단품')) detectedIsSet = false;

        switch (currentStep) {
            // 아직 주문이 시작되지 않은 상태
            case STEPS.IDLE: {
                if (detectedMenu) {
                    order.menu = detectedMenu;
                    order.isSet = detectedIsSet; // 세트/단품 안 말했으면 null 유지
                    currentStep = STEPS.MENU_CATEGORY;

                    const typeText =
                        order.isSet === null
                            ? '(단품/세트 미정)'
                            : order.isSet
                            ? '세트'
                            : '단품';

                    const msg = `▶ 주문 시작: 메뉴=${order.menu}, 종류=${typeText}, 현재 단계=${currentStep}`;
                    console.log(msg);
                    voiceOutput.textContent = voiceOutput.textContent + '\n' + msg;
                } else {
                    const msg =
                        '어떤 메뉴를 주문하실지 잘 못 들었어요. "불고기버거 세트 하나"처럼 말해 주세요.';
                    console.log(msg);
                    voiceOutput.textContent = msg;
                }
                break;
            }

            // 나중에 DESSERT, DRINK 등 단계별 처리를 여기에 추가 예정
            default: {
                const msg = `현재 단계(${currentStep})에 대한 음성 처리는 아직 구현되지 않았습니다.`;
                console.log(msg);
                voiceOutput.textContent = msg;
                break;
            }
        }
    }

} else {
    voiceButton.style.display = 'none';
    voiceOutput.textContent = '이 브라우저는 음성인식을 지원하지 않습니다.';
}
