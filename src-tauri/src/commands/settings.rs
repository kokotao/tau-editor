/// 设置相关命令模块
/// 
/// 实现自动保存配置等设置功能

use std::sync::atomic::{AtomicU64, Ordering};

/// 自动保存间隔 (秒)
/// 使用原子变量保证线程安全
static AUTO_SAVE_INTERVAL: AtomicU64 = AtomicU64::new(0);

/// 配置自动保存
/// 
/// # 参数
/// * `interval` - 自动保存间隔 (秒)
///   - 0 = 禁用自动保存
///   - 最小值：5 秒
/// 
/// # 返回
/// * `Ok(())` - 配置成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub fn auto_save_config(interval: u64) -> Result<(), String> {
    // 验证间隔：0 (禁用) 或 >= 5 秒
    if interval != 0 && interval < 5 {
        return Err("自动保存间隔最小为 5 秒".to_string());
    }
    
    // 更新配置
    AUTO_SAVE_INTERVAL.store(interval, Ordering::SeqCst);
    
    // 注意：实际的重启自动保存定时器逻辑需要在前端或单独的服务中实现
    // 这里只负责存储配置值
    
    Ok(())
}

/// 获取当前自动保存间隔
/// 
/// # 返回
/// * `u64` - 自动保存间隔 (秒)，0 表示禁用
#[tauri::command]
pub fn get_auto_save_interval() -> u64 {
    AUTO_SAVE_INTERVAL.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_auto_save_config_zero() {
        assert!(auto_save_config(0).is_ok());
        assert_eq!(get_auto_save_interval(), 0);
    }
    
    #[test]
    fn test_auto_save_config_valid() {
        assert!(auto_save_config(30).is_ok());
        assert_eq!(get_auto_save_interval(), 30);
    }
    
    #[test]
    fn test_auto_save_config_too_small() {
        assert!(auto_save_config(3).is_err());
    }
    
    #[test]
    fn test_auto_save_config_minimum() {
        assert!(auto_save_config(5).is_ok());
        assert_eq!(get_auto_save_interval(), 5);
    }
}
