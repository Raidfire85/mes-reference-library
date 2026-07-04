module.exports = {
  Uri: {
    file: (fsPath) => ({ fsPath, toString: () => fsPath }),
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, defaultValue) => {
        if (key === 'mesSourcePath') {
          return process.env.MES_SOURCE_PATH ?? '';
        }
        return defaultValue;
      },
    }),
  },
};
