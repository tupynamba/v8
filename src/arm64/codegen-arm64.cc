// Copyright 2013 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#if V8_TARGET_ARCH_ARM64

#include "src/codegen.h"

namespace v8 {
namespace internal {

#define __ ACCESS_MASM(masm)

UnaryMathFunction CreateSqrtFunction() { return nullptr; }

#undef __

}  // namespace internal
}  // namespace v8

#endif  // V8_TARGET_ARCH_ARM64