

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <qrcode.h>

// ---------------- WiFi ----------------
const char* sta_ssid     = "YOUR_WIFI_NAME";
const char* sta_password = "YOUR_WIFI_PASSWORD";
const char* backendUrl   = "http://192.168.1.100:8000/sensor-data";


const bool ENABLE_WIFI = false;

unsigned long lastWifiCheck   = 0;
unsigned long lastBackendPost = 0;
const unsigned long WIFI_CHECK_INTERVAL   = 20000;
const unsigned long BACKEND_POST_INTERVAL = 3000;

// ---------------- Pins ----------------
#define I2C_SDA      4
#define I2C_SCL      5
#define DHTPIN       2
#define SOUND_PIN    1
#define BUZZER_PIN   3
#define TOUCH_PIN    6
#define BATTERY_PIN  0

#define DHTTYPE      DHT11
#define MPU_ADDR     0x68

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
DHT dht(DHTPIN, DHTTYPE);
WebServer server(80);

// ---------------- Graph geometry ----------------
const int GRAPH_X      = 2;
const int GRAPH_Y      = 22;
const int GRAPH_WIDTH  = 124;
const int GRAPH_HEIGHT = 30;
const int GRAPH_BOTTOM = GRAPH_Y + GRAPH_HEIGHT;

int pitchValues[GRAPH_WIDTH];
int rollValues[GRAPH_WIDTH];
int soundValues[GRAPH_WIDTH];

const float ALPHA = 0.20;
float filteredPitch = 0.0;
float filteredRoll  = 0.0;
float filteredSound = 0.0;

float baselinePitch = 0.0;
float baselineRoll  = 0.0;
float baselineSound = 0.0;
float tiltThreshold  = 20.0;
float soundThreshold = 25.0;

unsigned long lastDHTRead = 0;
float tempC = 0.0;
float humidity = 0.0;
int soundLevel = 0;
int batteryPct = -1;
bool batterySensingOK = false;


enum Severity { SAFE = 0, CAUTION = 1, DANGER = 2 };
Severity currentSeverity = SAFE;
unsigned long lastAnomalyTime = 0;   
bool anomalyEverHappened = false;

// ---------------- UI state ----------------
int currentScreen = 0;
const int TOTAL_SCREENS = 8;

bool standbyMode = false;
bool hindiMode = false;

// ---------------- Debounced touch handling ----------------
bool touchRawState = LOW;
bool touchStableState = LOW;
unsigned long touchLastChangeTime = 0;
const unsigned long DEBOUNCE_MS = 30;
unsigned long touchPressStart = 0;
bool touchCurrentlyPressed = false;
const unsigned long LONG_PRESS_MS = 700;
bool longPressHandled = false;
unsigned long lastTapTime = 0;
const unsigned long DOUBLE_TAP_GAP = 400;

unsigned long bootStartTime = 0;
const unsigned long BOOT_ANIM_MS = 1800;

const char* txt(const char* en, const char* hi) {
  return hindiMode ? hi : en;
}

// ================= MPU6050 =================
bool readRawAccel(int16_t &ax, int16_t &ay, int16_t &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)6);
  if (Wire.available() >= 6) {
    ax = (Wire.read() << 8) | Wire.read();
    ay = (Wire.read() << 8) | Wire.read();
    az = (Wire.read() << 8) | Wire.read();
    return true;
  }
  return false;
}

int readBatteryPercentage() {
  int rawADC = analogRead(BATTERY_PIN);
  float voltage = (rawADC / 4095.0) * 3.3 * 2.0;
  if (voltage < 2.5 || voltage > 4.4) {
    batterySensingOK = false;
    return -1;
  }
  batterySensingOK = true;
  voltage = constrain(voltage, 3.2, 4.2);
  int pct = map((int)(voltage * 100), 320, 420, 0, 100);
  return constrain(pct, 0, 100);
}

// ================= Web dashboard =================
void handleRoot() {
  String html = "<!DOCTYPE html><html><head><title>SAMADHAAN Node</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<meta http-equiv='refresh' content='1'>";
  html += "<style>body{font-family:Arial;background:#0f172a;color:#fff;text-align:center;margin:0;padding:20px;}";
  html += ".card{background:#1e293b;padding:15px;margin:10px auto;max-width:400px;border-radius:8px;}";
  html += ".safe{background:#14532d;} .caution{background:#78350f;} .danger{background:#7f1d1d;}";
  html += ".val{font-size:1.8em;font-weight:bold;color:#38bdf8;}</style></head><body>";
  html += "<h1>SAMADHAAN Risk Dashboard</h1>";
  const char* sevClass = currentSeverity == DANGER ? "danger" : (currentSeverity == CAUTION ? "caution" : "safe");
  const char* sevText  = currentSeverity == DANGER ? "!! DANGER !!" : (currentSeverity == CAUTION ? "CAUTION" : "SAFE");
  html += "<div class='card " + String(sevClass) + "'><h2>" + String(sevText) + "</h2></div>";
  html += "<div class='card'><h3>Battery</h3><p><span class='val'>" + (batterySensingOK ? String(batteryPct) + "%" : String("N/A")) + "</span></p></div>";
  html += "<div class='card'><h3>Orientation (deviation)</h3><p>Pitch: <span class='val'>" + String((int)(filteredPitch - baselinePitch)) + "&deg;</span> | Roll: <span class='val'>" + String((int)(filteredRoll - baselineRoll)) + "&deg;</span></p></div>";
  html += "<div class='card'><h3>Environment</h3><p>Temp: <span class='val'>" + String((int)tempC) + " &deg;C</span> | Hum: <span class='val'>" + String((int)humidity) + " %</span></p></div>";
  html += "<div class='card'><h3>Sound level</h3><p><span class='val'>" + String(soundLevel) + "</span></p></div>";
  html += "<div class='card'><h3>Time since last anomaly</h3><p><span class='val'>" + (anomalyEverHappened ? String((millis() - lastAnomalyTime) / 1000) + "s" : String("none yet")) + "</span></p></div>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

// ================= WiFi (with diagnostic status codes) =================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(sta_ssid, sta_password);

  unsigned long startAttempt = millis();
  int dots = 0;
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println(txt("Connecting WiFi", "WiFi Jud Raha Hai"));
    display.setCursor(0, 16);
    for (int i = 0; i < (dots % 4); i++) display.print(".");
    display.setCursor(0, 32);
    display.print((millis() - startAttempt) / 1000);
    display.print("s ");
    display.print(txt("elapsed", "beet gaye"));
    display.display();
    dots++;
    delay(250);
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.println(txt("WiFi Connected!", "WiFi Jud Gaya!"));
    display.println(WiFi.localIP().toString());
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    display.println(txt("WiFi FAILED.", "WiFi Nahi Juda."));
    display.print(txt("Status code: ", "Status: "));
    display.println((int)WiFi.status());
    // Common WiFi.status() codes: 1=WL_NO_SSID_AVAIL (wrong SSID/not in range),
    // 4=WL_CONNECT_FAILED (usually wrong password), 6=WL_DISCONNECTED
    Serial.print("WiFi FAILED. Status code: ");
    Serial.println((int)WiFi.status());
  }
  display.display();
  delay(1200);
}

// ---- v6: HONEST sensor availability. Set these to match what is PHYSICALLY wired. A sensor that is
// not connected is sent as JSON null + *_available=false -- the dashboard will show "NOT CONNECTED"
// instead of an invented number. (No flex/strain sensor exists on this node: strain is always null.)
const bool DHT_CONNECTED   = false;   // DHT11 is not physically connected in the current validated build
const bool SOUND_CONNECTED = false;   // analog sound sensor is not physically connected in the current validated build
const bool STRAIN_CONNECTED = false;  // flex/strain telemetry is not implemented/validated in this firmware
const char* FW_VERSION = "v6.0";
unsigned long telemetrySeq = 0;
bool dhtEverRead = false;
bool mpuOk = true;                    // set false in your MPU read path if the I2C read fails

String nullable(bool ok, String v) { return ok ? v : String("null"); }

void sendDataToBackend() {
  // One JSON payload for BOTH the USB-Serial bridge and the Wi-Fi HTTP path (identical, with a shared
  // `sequence` so the backend can de-duplicate a packet that arrives over both transports).
  bool tempOk = DHT_CONNECTED && dhtEverRead;
  String payload = "{";
  payload += "\"node_id\":\"NODE-01\",";
  payload += "\"sequence\":" + String(telemetrySeq++) + ",";
  payload += "\"firmware_version\":\"" + String(FW_VERSION) + "\",";
  payload += "\"uptime\":" + String(millis() / 1000) + ",";
  payload += "\"pitch\":" + nullable(mpuOk, String(filteredPitch, 2)) + ",";
  payload += "\"roll\":" + nullable(mpuOk, String(filteredRoll, 2)) + ",";
  payload += "\"pitch_dev\":" + nullable(mpuOk, String(filteredPitch - baselinePitch, 2)) + ",";
  payload += "\"roll_dev\":" + nullable(mpuOk, String(filteredRoll - baselineRoll, 2)) + ",";
  payload += "\"mpu_available\":" + String(mpuOk ? "true" : "false") + ",";
  payload += "\"strain\":null,\"strain_dev\":null,\"strain_available\":" + String(STRAIN_CONNECTED ? "true" : "false") + ",";
  payload += "\"sound\":" + nullable(SOUND_CONNECTED, String(soundLevel)) + ",";
  payload += "\"sound_available\":" + String(SOUND_CONNECTED ? "true" : "false") + ",";
  payload += "\"temp\":" + nullable(tempOk, String(tempC, 1)) + ",";
  payload += "\"humidity\":" + nullable(tempOk, String(humidity, 1)) + ",";
  payload += "\"temp_available\":" + String(tempOk ? "true" : "false") + ",\"hum_available\":" + String(tempOk ? "true" : "false") + ",";
  payload += "\"rssi\":" + String(ENABLE_WIFI ? WiFi.RSSI() : 0) + ",";
  payload += "\"power_source\":\"USB\",";
  payload += "\"link_mode\":\"" + String(ENABLE_WIFI ? "WiFi" : "USB-Serial") + "\",";
  payload += "\"battery_pct\":" + String(batterySensingOK ? String(batteryPct) : String(-1)) + ",";
  payload += "\"battery_sensing_ok\":" + String(batterySensingOK ? "true" : "false") + ",";
  payload += "\"calibration_status\":\"BASELINE_AT_BOOT\",";
  payload += "\"alarm\":" + String(currentSeverity == DANGER ? "true" : "false");
  payload += "}";

  // Always print a machine-readable line prefixed with "TELEMETRY:" so
  // serial_bridge.py can find it even amidst other debug Serial.print()
  // calls elsewhere in this sketch.
  Serial.print("TELEMETRY:");
  Serial.println(payload);

  if (!ENABLE_WIFI) return; // USB-only mode -- the bridge script handles delivery

  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(backendUrl);
  http.addHeader("Content-Type", "application/json");

  int responseCode = http.POST(payload);
  Serial.print("Backend POST response: ");
  Serial.println(responseCode);
  http.end();
}

// ================= Debounced touch + gesture handling =================
int pollTouchGesture() {
  bool rawNow = digitalRead(TOUCH_PIN);
  unsigned long now = millis();

  if (rawNow != touchRawState) {
    touchRawState = rawNow;
    touchLastChangeTime = now;
  }

  int gesture = 0;

  if ((now - touchLastChangeTime) > DEBOUNCE_MS && touchStableState != touchRawState) {
    touchStableState = touchRawState;

    if (touchStableState == HIGH) {
      touchCurrentlyPressed = true;
      touchPressStart = now;
      longPressHandled = false;
    } else {
      if (touchCurrentlyPressed && !longPressHandled) {
        unsigned long pressDuration = now - touchPressStart;
        if (pressDuration < LONG_PRESS_MS) {
          if (now - lastTapTime < DOUBLE_TAP_GAP) {
            gesture = 2;
            lastTapTime = 0;
          } else {
            lastTapTime = now;
            gesture = 1;
          }
        }
      }
      touchCurrentlyPressed = false;
    }
  }

  if (touchCurrentlyPressed && !longPressHandled && (now - touchPressStart) > LONG_PRESS_MS) {
    longPressHandled = true;
    gesture = 3;
  }

  return gesture;
}

void handleTouchInput() {
  int gesture = pollTouchGesture();
  if (gesture == 0) return;

  if (gesture == 3) {
    hindiMode = !hindiMode;
    display.clearDisplay();
    display.setCursor(10, 25);
    display.setTextSize(1);
    display.println(hindiMode ? "Hindi Mode ON" : "English Mode ON");
    display.display();
    delay(600);
    return;
  }

  if (standbyMode) {
    if (gesture == 1 || gesture == 2) {
      standbyMode = false;
      display.ssd1306_command(SSD1306_DISPLAYON);
    }
    return;
  }

  if (gesture == 2) {
    standbyMode = true;
    noTone(BUZZER_PIN);
    display.clearDisplay();
    display.setCursor(15, 20);
    display.println(txt("STANDBY", "NIDRA MODE"));
    display.setCursor(5, 36);
    display.println(txt("Tap to wake", "Jagane Ke Liye Chhuein"));
    display.display();
    delay(150);
    display.ssd1306_command(SSD1306_DISPLAYOFF);
  } else if (gesture == 1) {
    currentScreen = (currentScreen + 1) % TOTAL_SCREENS;
  }
}

// ================= Draw a live QR code encoding the dashboard URL =================
void drawDashboardQR() {
  if (WiFi.status() != WL_CONNECTED) {
    display.setCursor(4, 25);
    display.println(txt("Connect WiFi first", "Pehle WiFi Judiye"));
    return;
  }

  String url = "http://" + WiFi.localIP().toString() + "/";

  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(4)];
  qrcode_initText(&qrcode, qrcodeData, 4, ECC_LOW, url.c_str());

  int scale = 2; // each QR module drawn as a 2x2 pixel block
  int qrPixelSize = qrcode.size * scale;
  int offsetX = (SCREEN_WIDTH - qrPixelSize) / 2;
  int offsetY = 14;

  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale, SSD1306_WHITE);
      }
    }
  }
}

// ================= Setup =================
void setup() {
  Serial.begin(115200);
  delay(300);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  dht.begin();
  pinMode(SOUND_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TOUCH_PIN, INPUT);
  digitalWrite(BUZZER_PIN, LOW);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    while (true) delay(1000);
  }

  bootStartTime = millis();
  while (millis() - bootStartTime < BOOT_ANIM_MS) {
    unsigned long elapsed = millis() - bootStartTime;
    int barWidth = map(elapsed, 0, BOOT_ANIM_MS, 0, 110);
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 10);
    display.println("SAMADHAAN");
    display.setCursor(10, 24);
    display.println("Mine Subsidence Node");
    display.drawRect(9, 42, 112, 10, SSD1306_WHITE);
    display.fillRect(11, 44, barWidth, 6, SSD1306_WHITE);
    display.display();
    delay(30);
  }

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission();
  delay(100);

  for (int i = 0; i < GRAPH_WIDTH; i++) {
    pitchValues[i] = GRAPH_HEIGHT / 2;
    rollValues[i]  = GRAPH_HEIGHT / 2;
    soundValues[i] = GRAPH_HEIGHT / 2;
  }

  if (ENABLE_WIFI) {
    connectWiFi();
    server.on("/", handleRoot);
    server.begin();
  } else {
    Serial.println("USB-SERIAL MODE: WiFi disabled (ENABLE_WIFI=false). Streaming telemetry over Serial for serial_bridge.py.");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println(txt("USB SERIAL MODE", "USB SERIAL MODE"));
    display.println(txt("Data streams via", "Data USB dwara"));
    display.println(txt("USB cable, no WiFi", "jaayega, WiFi nahi"));
    display.display();
    delay(1200);
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(txt("Calibrating...", "Calibrate Ho Raha..."));
  display.println(txt("Keep node still", "Node Ko Sthir Rakhein"));
  display.display();

  float pSum = 0, rSum = 0, sSum = 0;
  const int N = 40;
  for (int i = 0; i < N; i++) {
    int16_t ax, ay, az;
    if (readRawAccel(ax, ay, az)) {
      float p = atan2((float)ay, sqrt((float)ax * ax + (float)az * az)) * 180.0 / M_PI;
      float r = atan2(-(float)ax, (float)az) * 180.0 / M_PI;
      pSum += p;
      rSum += r;
    }
      if (SOUND_CONNECTED) sSum += analogRead(SOUND_PIN);
    delay(40);
  }
  baselinePitch = pSum / N;
  baselineRoll  = rSum / N;
  baselineSound = SOUND_CONNECTED ? (sSum / N) : 0;
  filteredPitch = baselinePitch;
  filteredRoll  = baselineRoll;
  filteredSound = baselineSound;

  batteryPct = readBatteryPercentage();
  lastAnomalyTime = millis(); // safety counter starts counting from boot

  Serial.print("Baseline pitch: "); Serial.println(baselinePitch);
  Serial.print("Baseline roll: ");  Serial.println(baselineRoll);
  Serial.print("Baseline sound (raw ADC): "); Serial.println(baselineSound);
  Serial.print("Battery sensing OK: "); Serial.println(batterySensingOK ? "yes" : "no (check divider wiring)");
}

// ================= Main loop =================
void loop() {
  if (ENABLE_WIFI) server.handleClient();
  handleTouchInput();

  if (ENABLE_WIFI && millis() - lastWifiCheck > WIFI_CHECK_INTERVAL) {
    lastWifiCheck = millis();
    wl_status_t status = WiFi.status();
    if (status != WL_CONNECTED) {
      Serial.print("WiFi not connected, status code: ");
      Serial.print((int)status);
      Serial.println(" -- retrying...");
      WiFi.disconnect(true, true);
      delay(300);
      WiFi.begin(sta_ssid, sta_password);
    }
  }

  if (standbyMode) {
    delay(80);
    return;
  }

  if (millis() - lastDHTRead > 2000) {
    lastDHTRead = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) { tempC = t; humidity = h; dhtEverRead = true; }
    batteryPct = readBatteryPercentage();
  }

  if (SOUND_CONNECTED) {
    int rawSound = analogRead(SOUND_PIN);
    filteredSound = (ALPHA * rawSound) + ((1.0 - ALPHA) * filteredSound);
    float soundDevRaw = filteredSound - baselineSound;
    soundLevel = (int)constrain(soundDevRaw, 0, 4095);
  } else {
    soundLevel = 0;
  }

  int16_t ax, ay, az;
  mpuOk = readRawAccel(ax, ay, az);   // v6: reported honestly in telemetry (mpu_available)
  if (mpuOk) {
    float rawPitch = atan2((float)ay, sqrt((float)ax * ax + (float)az * az)) * 180.0 / M_PI;
    float rawRoll  = atan2(-(float)ax, (float)az) * 180.0 / M_PI;
    filteredPitch = (ALPHA * rawPitch) + ((1.0 - ALPHA) * filteredPitch);
    filteredRoll  = (ALPHA * rawRoll)  + ((1.0 - ALPHA) * filteredRoll);
  }

  float pitchDev = filteredPitch - baselinePitch;
  float rollDev  = filteredRoll  - baselineRoll;
  float maxDev = max(abs(pitchDev), abs(rollDev));

  // ---- 3-tier severity (NEW): SAFE / CAUTION / DANGER ----
  if (maxDev > tiltThreshold || soundLevel > soundThreshold * 20) {
    currentSeverity = DANGER;
  } else if (maxDev > tiltThreshold * 0.5 || soundLevel > soundThreshold * 10) {
    currentSeverity = CAUTION;
  } else {
    currentSeverity = SAFE;
  }

  if (currentSeverity != SAFE) {
    lastAnomalyTime = millis();
    anomalyEverHappened = true;
  }

  if (currentSeverity == DANGER) {
    tone(BUZZER_PIN, (millis() / 200) % 2 == 0 ? 2400 : 1800);   // fast dual-tone alarm
  } else if (currentSeverity == CAUTION) {
    if ((millis() / 1500) % 2 == 0) tone(BUZZER_PIN, 1500); else noTone(BUZZER_PIN); // slow single beep
  } else {
    noTone(BUZZER_PIN);
  }

  if (millis() - lastBackendPost > BACKEND_POST_INTERVAL) {
    lastBackendPost = millis();
    sendDataToBackend();
  }

  int mappedPitch = map(constrain((int)pitchDev, -60, 60), -60, 60, 0, GRAPH_HEIGHT);
  int mappedRoll  = map(constrain((int)rollDev, -60, 60), -60, 60, 0, GRAPH_HEIGHT);
  int mappedSound = map(constrain(soundLevel, 0, 500), 0, 500, 0, GRAPH_HEIGHT);

  for (int i = 0; i < GRAPH_WIDTH - 1; i++) {
    pitchValues[i] = pitchValues[i + 1];
    rollValues[i]  = rollValues[i + 1];
    soundValues[i] = soundValues[i + 1];
  }
  pitchValues[GRAPH_WIDTH - 1] = mappedPitch;
  rollValues[GRAPH_WIDTH - 1]  = mappedRoll;
  soundValues[GRAPH_WIDTH - 1] = mappedSound;

  // ================= Render =================
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  if (currentSeverity == DANGER) {
    bool flashOn = (millis() / 300) % 2 == 0;
    if (flashOn) {
      display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
      display.setTextColor(SSD1306_BLACK);
    }
    display.setCursor(8, 2);
    display.print(txt("!! DANGER !!", "!! KHATRA !!"));
    display.setTextColor(SSD1306_WHITE);
    int pulse = 3 + (int)(3 * sin(millis() / 150.0));
    int cx = 118, cy = 6;
    display.drawTriangle(cx, cy - pulse, cx - pulse, cy + pulse, cx + pulse, cy + pulse, SSD1306_WHITE);
  } else if (currentSeverity == CAUTION) {
    display.setCursor(8, 1);
    display.print(txt("CAUTION - Monitoring", "SAAVDHAN"));
    // small pulsing dot instead of a full flashing banner -- calmer, "early warning" feel
    int pulse = 1 + (int)(2 * sin(millis() / 300.0));
    display.fillCircle(120, 5, 2 + pulse, SSD1306_WHITE);
    display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
  } else {
    display.setCursor(0, 0);
    display.print("S"); display.print(currentScreen + 1); display.print("/8");
    display.setCursor(38, 0);
    display.print(WiFi.status() == WL_CONNECTED ? "WiFi:OK" : "WiFi:--");
    display.setCursor(94, 0);
    if (batterySensingOK) { display.print(batteryPct); display.print("%"); }
    else { display.print("BAT:NA"); }
    display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
  }

  int topOffset = (currentSeverity != SAFE) ? 14 : 12;

  auto drawGraph = [&](int* arr, const char* label) {
    display.setCursor(2, topOffset);
    display.print(label);
    display.drawRect(0, GRAPH_Y - 1, 128, GRAPH_HEIGHT + 2, SSD1306_WHITE);
    for (int x = 0; x < GRAPH_WIDTH - 1; x++) {
      int y1 = GRAPH_BOTTOM - arr[x];
      int y2 = GRAPH_BOTTOM - arr[x + 1];
      display.drawLine(GRAPH_X + x, y1, GRAPH_X + x + 1, y2, SSD1306_WHITE);
    }
  };

  if (currentScreen == 0) {
    drawGraph(pitchValues, txt("PITCH DEV (deg)", "JHUKAV BADLAV"));
  } else if (currentScreen == 1) {
    drawGraph(rollValues, txt("ROLL DEV (deg)", "GHOORNAN BADLAV"));
  } else if (currentScreen == 2) {
    drawGraph(soundValues, txt("SOUND DEV", "AAWAZ BADLAV"));
  } else if (currentScreen == 3) {
    display.setCursor(2, topOffset + 2);  display.print(txt("Pitch dev: ", "Jhukav: ")); display.print((int)pitchDev); display.print((char)247);
    display.setCursor(2, topOffset + 14); display.print(txt("Roll dev:  ", "Ghoornan: ")); display.print((int)rollDev); display.print((char)247);
    display.setCursor(2, topOffset + 26); display.print(txt("Temp:      ", "Tapmaan: ")); display.print((int)tempC); display.print("C");
    display.setCursor(2, topOffset + 38); display.print(txt("Humidity:  ", "Namee: ")); display.print((int)humidity); display.print("%");
  } else if (currentScreen == 4) {
    int riskScore = map(constrain(abs((int)pitchDev) + abs((int)rollDev) + (soundLevel / 10), 0, 150), 0, 150, 5, 99);
    display.setCursor(4, topOffset); display.print(txt("AI ANOMALY ENGINE", "AI JOKHIM SUCHAK"));
    display.drawRect(4, topOffset + 12, 120, 18, SSD1306_WHITE);
    display.setCursor(10, topOffset + 17);
    display.print(txt("RISK: ", "JOKHIM: ")); display.print(riskScore); display.print("/100");
    display.setCursor(4, topOffset + 34);
    display.print(riskScore > 60 ? txt("HIGH THREAT", "UCHCH KHATRA") : txt("NOMINAL", "SAMAANYA"));
  } else if (currentScreen == 5) {
    // ---- NEW: Bubble-level widget ----
    display.setCursor(2, topOffset);
    display.print(txt("SPIRIT LEVEL", "JHUKAV DARSHAK"));
    int cx = 64, cy = topOffset + 26, r = 24;
    display.drawCircle(cx, cy, r, SSD1306_WHITE);
    display.drawCircle(cx, cy, 3, SSD1306_WHITE);      // center target ring
    int bubbleX = cx + constrain((int)(rollDev * 1.2), -r + 4, r - 4);
    int bubbleY = cy - constrain((int)(pitchDev * 1.2), -r + 4, r - 4);
    display.fillCircle(bubbleX, bubbleY, 4, SSD1306_WHITE);
  } else if (currentScreen == 6) {
    // ---- NEW: Live QR code to dashboard ----
    display.setCursor(2, topOffset - 2);
    display.print(txt("SCAN FOR LIVE DASHBOARD", "SCAN KAREIN"));
    drawDashboardQR();
  } else if (currentScreen == 7) {
    // ---- NEW: Safety counter, industrial-signage style ----
    display.setCursor(2, topOffset);
    display.print(txt("TIME SINCE LAST ANOMALY", "PICHLE KHATRE SE"));
    unsigned long secsSince = (millis() - lastAnomalyTime) / 1000;
    unsigned long hrs = secsSince / 3600;
    unsigned long mins = (secsSince % 3600) / 60;
    unsigned long secs = secsSince % 60;
    display.setTextSize(2);
    display.setCursor(10, topOffset + 16);
    char buf[16];
    sprintf(buf, "%02lu:%02lu:%02lu", hrs, mins, secs);
    display.print(buf);
    display.setTextSize(1);
    display.setCursor(2, topOffset + 38);
    display.print(anomalyEverHappened ? txt("(hh:mm:ss)", "(ghanta:min:sec)") : txt("No anomaly yet", "Abhi tak koi nahi"));
  }

  display.display();
  delay(30);
}
