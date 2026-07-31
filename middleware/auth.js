function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: '로그인이 필요합니다.' });
}

// 메인 관리자만 통과 (부관리자는 차단)
function requireMainAdmin(req, res, next) {
  if (req.session && req.session.isAdmin && req.session.adminRole === 'main') {
    return next();
  }
  return res.status(403).json({ error: '메인 관리자만 접근할 수 있습니다.' });
}

// 특정 권한을 가진 관리자만 통과 (메인 관리자는 모든 권한 보유로 간주)
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session || !req.session.isAdmin) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    if (req.session.adminRole === 'main') {
      return next();
    }
    if (req.session.adminPermissions && req.session.adminPermissions[permission]) {
      return next();
    }
    return res.status(403).json({ error: '이 작업을 수행할 권한이 없습니다.' });
  };
}

module.exports = { requireAuth, requireMainAdmin, requirePermission };
