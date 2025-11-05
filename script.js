// 1. 설정: 인식할 키워드를 이곳에 추가하거나 수정하세요.
const TARGET_WORDS = ['버거', '음료', '주문', '결제'];

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
        const transcript = event.results[0][0].transcript;
        voiceOutput.textContent = transcript;

        // TODO: 인식된 텍스트(transcript)를 분석하여 주문 처리 로직 추가
        if (transcript.includes('버거')) {
            console.log('사용자가 버거를 주문했습니다.');
            // 예: ocrOutput에서 '버거'를 찾아 하이라이트
        }
    };

    recognition.onerror = (event) => {
        voiceOutput.textContent = `음성인식 오류: ${event.error}`;
    };

    recognition.onend = () => {
        voiceButton.textContent = '음성인식 시작';
    };

} else {
    voiceButton.style.display = 'none';
    voiceOutput.textContent = '이 브라우저는 음성인식을 지원하지 않습니다.';
}

