# API 说明

## 定义

- `$PREFIX` 代表此项目的运行根目录。

```ts
type RuntimeError = 
  'timeout' | // 超时
  'memout'  | // 内存超过限制
  'violate' | // 系统被攻击
  'system'  | // 服务器内部错误
  'other';    // runtimeerror运行时错误
type GccDiagnostics = /* see devcpp7 */;
type GdbResponse = /* see tsgdbmi */;

type OjType = 'programmingGrid' | 'openjudge';
type SolutionStatusType = 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE' | 'PE' | 'Waiting' | 'Unknown';
```

## 前端访问

```
GET $PREFIX/
```

访问前端页面。

#### searchParam

```
ojType: "programmingGrid" | "openjudge" 
courseId: <any>
problemSetId: <any>
problemId: <any>
```

若带有 `ojType`，则
- 发送 `$PREFIX/user/getInfo` 请求，记响应为 `r`。若 `!r.success`：
  - 强制显示登录模态框，完成注册或登录（设置 Cookie）。
  - 再次发送 `$PREFIX/user/getInfo` 请求，覆盖 `r`。若仍 `!r.success` 则致命错误。
- 检验 `ojType in r.authorized`。若否：
  - 模态框中显示授权信息，授权完成发送 `$PREFIX/user/authorize`。若授权失败则重试。
  - 设置 `r.authorized[ojType].courseId` 为 `null`。
- 若带有 `courseId`，则检验 `r.authorized[ojType].courseId === courseId`。若否：
  - 设置课程（若修改需提示用户）。发送 `$PREFIX/oj/setCourse`。若失败则致命错误。
- 准备工作完成，模态框可释放。
- 若带有 `problemId`，则发送 `$PREFIX/oj/getProblem/...`。

#### hash

由 Angular 路由处理。

## 前后端交互（HTTPS）

HTTPS 使用 REST 风格交互：请求和响应都是 JSON 格式。下文中，以 TypeScript 类型声明来描述它们。

### C++ 编译

```
POST $PREFIX/cpp/compile
```

#### 格式

```ts
type CppCompileRequest = {
  code: string;
  execute: 'none' | 'file' | 'interactive' | 'debug';
  stdin?: string;         // If execute is 'file'
};
type CppCompileResponse = {
  status: 'error';
  errorType: 'compile' | 'link' | 'other';
  error: GccDiagnostics | string; // GccDiagnostics for 'compile', string for others 
} | {
  status: 'ok';
  execute: 'none';        // If `execute` in request is 'none'
  error: GccDiagnostics;  // Compile warning, [] if none
} | {
  status: 'ok';
  execute: 'file';        // If `execute` in request is 'file'
  error: GccDiagnostics;  // Compile warning, [] if none
  result: 'ok' | 'error';
  exitCode?: number;      // If result is 'ok'
  reason?: RuntimeError;  // If result is 'error'
  stdout: string;
  stderr: string;
} | {
  status: 'ok';
  execute: 'interactive'; // If `execute` in request is 'interactive'
  error: GccDiagnostics;  // Compile warning, [] if none
  executeToken: string;
  expireDate: string;
} | {
  status: 'ok';
  execute: 'debug';       // If `execute` in request in 'debug'
  error: GccDiagnostics;  // Compile warning, [] if none
  debugToken: string;     // If status is 'ok' 
  expireDate: string;     // If status is 'ok'
};
```

前端获取到 `executeToken` 后，将其作为 `$EXECUTE_TOKEN` 以进行 WebSocket 交互。

前端获取到 `debugToken` 后，将其作为 `$DEBUG_TOKEN` 以进行 WebSocket 交互。


### 获取头文件内容

```
POST $PREFIX/cpp/getHeaderFile
```

```ts
type CppGetHeaderFileRequest = {
  path: string;
};
type CppGetHeaderFileResponse = {
  success: true;
  content: string;
} | {
  success: false;
  reason: string;
}
```

<!-- ### C++ 获取可执行文件

```
POST $PREFIX/cpp/download
```

#### 格式

```ts
type CppDownloadRequest = {
  code: string;
  platform: 'mingw' | 'linux' | 'darwin';
};
type CppDownloadResponse = {
  downloadLink: string;
  expireDate: string;
};
``` -->

## 前后端交互（WebSocket）

WebSocket 中传输的字符串应全部为 JSON 格式。

### C++ 运行

```
ws://$PREFIX/ws/execute/$EXECUTE_TOKEN
```

对 `$EXECUTE_TOKEN` 所指代进程作 IO 交互。

#### 格式
```ts
type WsExecuteC2S = {
  type: 'start';
} | {
  type: 'shutdown';
} | {
  type: 'eof';
} | {
  type: 'tin';
  content: string;
};
type WsExecuteS2C = {
  type: 'started';
} | {
  type: 'closed';
  exitCode: number;
} | {
  type: 'error';
  reason: RuntimeError;
} | {
  type: 'tout';
  content: string;
}
```

### Clangd 语言服务器

```
ws://$PREFIX/ws/languageServer/cpp
```

与 Clangd 语言服务器通信。交互格式由 LSP 规范规定。

```
ws://$PREFIX/ws/languageServer/python
```

与 Python 语言服务器通信。交互格式由 LSP 规范规定。

### GDB 调试

```
ws://$PREFIX/ws/debug/gdb/$DEBUG_TOKEN
```

与 GDB-MI 交互。

#### 格式

```ts
type WsDebugGdbC2S = {
  type: 'start';
} | {
  type: 'request';
  request: string;
} | {
  type: 'tin';
  content: string;
} | {
  type: 'shutdown';
};
type WsDebugGdbS2C = {
  type: 'started';
  sourceFilePath: string;
} | {
  type: 'closed';
  exitCode: number;
} | {
  type: 'error';
  reason: RuntimeError;
} | {
  type: 'response';
  response: GdbResponse;
} | {
  type: 'tout';
  content: string;
};
```
## 用户系统

### 注册

```
POST $PREFIX/user/register
```

```ts
type UserRegisterRequest = {
  email: string;
  username: string;
  password: string;
};
type UserRegisterResponse = {
  success: true;
} | {
  success: false;
  message: string;
};

```
响应若返回 `success: true`，则应包含 `Set-Cookie` 头。

### 登录

```
POST $PREFIX/user/login
```

```ts
type UserLoginRequest = {
  email: string;
  password: string;
};
type UserLoginResponse = UserRegisterResponse;
```

响应若返回 `success: true`，则应包含 `Set-Cookie` 头。

### 修改密码

```
POST $PREFIX/user/changePassword
```

```ts
type UserChangePasswordRequest = {
  email: string;
  oldPassword: string;
  newPassword: string;
};
type UserChangePasswordResponse = UserRegisterResponse;
```

### 修改密码

```
POST $PREFIX/user/changeUsername
```

```ts
type UserChangeUsernameRequest = {
  newUsername: string;
};
type UserChangeUsernameResponse = UserRegisterResponse;
```

### 获取用户信息

```
GET $PREFIX/user/getInfo
```

```ts
type UserGetInfoResponse = {
  success: true;
  username: string;
  email: string | undefined,
  status: string,
  authorized: Map<string, string[]> | undefined;
} | {
  success: false;
};
```

### 授权

```
POST $PREFIX/user/authorize
```

```ts
type UserAuthorizeRequest = {
  type: OjType
  secret: any | null; // password or unauthorize
};
type UserAuthorizeResponse = {
  success: true;
} | {
  success: false;
  reason: string;
};
```

## OJ 相关

### 提交

```
POST $PREFIX/oj/submit
```

```ts
type OjSubmitRequest = {
  problemId: string;
  problemSetId: string;
  code: string;
};
type OjSubmitResponse = {
  success: true;
  solutionId: string;
} | {
  success: false;
  reason: string;
};
```

### 验证码

获取验证码

```
POST $PREFIX/user/getVeriCode
```

```typescript
type UserGetVeriCodeRequest = {
  email: string;
};

type UserGetVeriCodeResponse = {
  success: true;
  // title: string;
} | {
  success: false;
  reason: string;
};
```

验证验证码 通过点击向用户邮箱中发送的邮件的链接完成


### 查看提交结果

```
GET $PREFIX/oj/getSolution/$SOLUTION_ID
```

```ts
type OjGetSolutionResponse = {
  success: true;
  status: SolutionStatusType;
  hint?: string;
  time?: string;
  memory?: string;
} | {
  success: false;
  reason: string;
};
```

### 获取题目信息

```
GET $PREFIX/oj/getProblem/$PROBLEM_SET_ID/$PROBLEM_ID
```

```ts
type OjGetProblemResponse = {
  success: true;
  title: string;
  description: string;
  aboutInput: string;
  aboutOutput: string;
  sampleInput: string;
  sampleOutput: string;
  hint: string;
} | {
  success: false;
  reason: string;
};
```

### 获取题目列表

```
GET $PREFIX/oj/listProblems/$PROBLEM_SET_ID
```

```ts
type OjListProblemsResponse = {
  success: true;
  title: string; // Problem set title
  problems: {
    title: string;
    problemId: string;
    status: 'accepted' | 'tried' | 'none';
  }[];
} | {
  success: false;
  reason: string;
};
```

### 获取题集列表

```
GET $PREFIX/oj/listProblemSets
```

```ts
type OjListProblemSetsResponse = {
  success: true;
  title: string; // Course title
  problemSets: {
    title: string;
    problemSetId: string;
    status: 'ok' | 'closed';
  }[];
} | {
  success: false;
  reason: string;
};
```

### 设置课程

```
POST $PREFIX/oj/setCourse
```

```ts
type OjSetCourseRequest = {
  OJtype: string
  courseId: string;
};
type OjSetCourseResponse = {
  success: true;
  title: string;
} | {
  success: false;
  reason: string;
};
```

### 查看提交历史

```
GET $PREFIX/oj/submitHistory/$PROBLEM_SET_ID/$PROBLEM_ID
```

```ts
type OjSubmitHistoryResponse = {
  success: true;
  history: {
    solutionId: string;
  }[];
} | {
  success: false;
  reason: string;
};
```

### 设置 OJ 类型

```
POST $PREFIX/oj/setType
```

```ts
type OjSetTypeRequest = {
  type: OjType
};
type OjSetTypeResponse = {
  success: boolean;
};
```
