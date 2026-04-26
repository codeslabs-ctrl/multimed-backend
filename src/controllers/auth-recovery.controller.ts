import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { EmailService } from '../services/email.service.js';
import { ApiResponse } from '../types/index.js';
import bcrypt from 'bcrypt';

export class AuthRecoveryController {
  // Generar y enviar OTP para recuperación de contraseña
  static async requestPasswordRecovery(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔐 requestPasswordRecovery llamado con email:', req.body.email);
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          error: { message: 'Email es requerido' }
        } as ApiResponse<null>);
        return;
      }

      // Buscar usuario por email (PostgreSQL)
      const client = await postgresPool.connect();
      let usuario: any;
      try {
        const result = await client.query(
          'SELECT id, email, username FROM usuarios WHERE email = $1 LIMIT 1',
          [email]
        );

        if (result.rows.length === 0) {
          // Por seguridad, no revelar si el email existe o no
          res.json({
            success: true,
            data: { message: 'Si el email existe, recibirá un código de recuperación' }
          } as ApiResponse<{ message: string }>);
          return;
        }

        usuario = result.rows[0];
      } finally {
        client.release();
      }

      // Generar OTP (8 dígitos)
      const otp = Math.floor(10000000 + Math.random() * 90000000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
      
      console.log('🔐 OTP generado para recuperación de contraseña:');
      console.log('  - Email:', email);
      console.log('  - Usuario ID:', usuario.id);
      console.log('  - OTP:', otp);
      console.log('  - Expira en:', expiresAt.toISOString());

      // Guardar OTP en la base de datos (PostgreSQL)
      const otpClient = await postgresPool.connect();
      try {
        await otpClient.query(
          `INSERT INTO otp_tokens (usuario_id, token, tipo, expires_at, usado)
           VALUES ($1, $2, $3, $4, false)`,
          [usuario.id, otp, 'password_recovery', expiresAt]
        );
      } catch (otpError) {
        console.error('Error saving OTP:', otpError);
        res.status(500).json({
          success: false,
          error: { message: 'Error generando código de recuperación' }
        } as ApiResponse<null>);
        return;
      } finally {
        otpClient.release();
      }

      // Enviar email con OTP
      console.log('🔐 Iniciando envío de email de recuperación:');
      console.log('  - Usuario:', usuario.username);
      console.log('  - Email:', usuario.email);
      console.log('  - OTP generado:', otp);
      
      const emailService = new EmailService();
      const emailSent = await emailService.sendPasswordRecoveryOTP(
        usuario.email,
        {
          nombre: usuario.username,
          otp: otp,
          expiresIn: '15 minutos'
        }
      );

      console.log('📧 Resultado del envío de email:', emailSent);

      if (!emailSent) {
        console.error('❌ Error sending recovery email');
        res.status(500).json({
          success: false,
          error: { message: 'Error enviando email de recuperación' }
        } as ApiResponse<null>);
        return;
      }

      console.log('✅ Email de recuperación enviado exitosamente');

      res.json({
        success: true,
        data: { message: 'Código de recuperación enviado a su email' }
      } as ApiResponse<{ message: string }>);

    } catch (error) {
      console.error('Error in requestPasswordRecovery:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Verificar OTP y cambiar contraseña
  static async verifyOTPAndResetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp, newPassword } = req.body;

      if (!email || !otp || !newPassword) {
        res.status(400).json({
          success: false,
          error: { message: 'Email, OTP y nueva contraseña son requeridos' }
        } as ApiResponse<null>);
        return;
      }

      // Buscar usuario (PostgreSQL)
      const client = await postgresPool.connect();
      let usuario: any;
      try {
        const result = await client.query(
          'SELECT id, email FROM usuarios WHERE email = $1 LIMIT 1',
          [email]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Usuario no encontrado' }
          } as ApiResponse<null>);
          return;
        }

        usuario = result.rows[0];
      } finally {
        client.release();
      }

      // Verificar OTP (PostgreSQL)
      const otpClient = await postgresPool.connect();
      let otpData: any;
      try {
        const otpResult = await otpClient.query(
          `SELECT * FROM otp_tokens
           WHERE usuario_id = $1
             AND token = $2
             AND tipo = $3
             AND usado = false
             AND expires_at >= NOW()
           LIMIT 1`,
          [usuario.id, otp, 'password_recovery']
        );

        if (otpResult.rows.length === 0) {
          res.status(400).json({
            success: false,
            error: { message: 'Código OTP inválido o expirado' }
          } as ApiResponse<null>);
          return;
        }

        otpData = otpResult.rows[0];
      } finally {
        otpClient.release();
      }

      // Cambiar contraseña (PostgreSQL)
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updateClient = await postgresPool.connect();
      try {
        await updateClient.query('BEGIN');
        
        await updateClient.query(
          'UPDATE usuarios SET password_hash = $1 WHERE id = $2',
          [hashedPassword, usuario.id]
        );

        await updateClient.query(
          'UPDATE otp_tokens SET usado = true WHERE id = $1',
          [otpData.id]
        );

        await updateClient.query('COMMIT');
      } catch (updateError) {
        await updateClient.query('ROLLBACK');
        console.error('Error updating password:', updateError);
        res.status(500).json({
          success: false,
          error: { message: 'Error actualizando contraseña' }
        } as ApiResponse<null>);
        return;
      } finally {
        updateClient.release();
      }

      res.json({
        success: true,
        data: { message: 'Contraseña actualizada exitosamente' }
      } as ApiResponse<{ message: string }>);

    } catch (error) {
      console.error('Error in verifyOTPAndResetPassword:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Generar y enviar OTP para verificación de usuario nuevo
  static async sendUserVerificationOTP(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          error: { message: 'Email es requerido' }
        } as ApiResponse<null>);
        return;
      }

      // Buscar usuario por email (PostgreSQL)
      const client = await postgresPool.connect();
      let usuario: any;
      try {
        const result = await client.query(
          'SELECT id, email, username FROM usuarios WHERE email = $1 LIMIT 1',
          [email]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Usuario no encontrado' }
          } as ApiResponse<null>);
          return;
        }

        usuario = result.rows[0];
      } finally {
        client.release();
      }

      // Generar OTP (8 dígitos)
      const otp = Math.floor(10000000 + Math.random() * 90000000).toString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

      // Guardar OTP en la base de datos (PostgreSQL)
      const otpClient = await postgresPool.connect();
      try {
        await otpClient.query(
          `INSERT INTO otp_tokens (usuario_id, token, tipo, expires_at, usado)
           VALUES ($1, $2, $3, $4, false)`,
          [usuario.id, otp, 'user_verification', expiresAt]
        );
      } catch (otpError) {
        console.error('Error saving OTP:', otpError);
        res.status(500).json({
          success: false,
          error: { message: 'Error generando código de verificación' }
        } as ApiResponse<null>);
        return;
      } finally {
        otpClient.release();
      }

      // Enviar email con OTP
      const emailService = new EmailService();
      const emailSent = await emailService.sendUserVerificationOTP(
        usuario.email,
        {
          nombre: usuario.username,
          otp: otp,
          expiresIn: '30 minutos'
        }
      );

      if (!emailSent) {
        console.error('Error sending verification email');
        res.status(500).json({
          success: false,
          error: { message: 'Error enviando email de verificación' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: { message: 'Código de verificación enviado a su email' }
      } as ApiResponse<{ message: string }>);

    } catch (error) {
      console.error('Error in sendUserVerificationOTP:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Verificar OTP de usuario nuevo
  static async verifyUserOTP(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        res.status(400).json({
          success: false,
          error: { message: 'Email y OTP son requeridos' }
        } as ApiResponse<null>);
        return;
      }

      // Buscar usuario (PostgreSQL)
      const client = await postgresPool.connect();
      let usuario: any;
      try {
        const result = await client.query(
          'SELECT id, email FROM usuarios WHERE email = $1 LIMIT 1',
          [email]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Usuario no encontrado' }
          } as ApiResponse<null>);
          return;
        }

        usuario = result.rows[0];
      } finally {
        client.release();
      }

      // Verificar OTP (PostgreSQL)
      const otpClient = await postgresPool.connect();
      let otpData: any;
      try {
        const otpResult = await otpClient.query(
          `SELECT * FROM otp_tokens
           WHERE usuario_id = $1
             AND token = $2
             AND tipo = $3
             AND usado = false
             AND expires_at >= NOW()
           LIMIT 1`,
          [usuario.id, otp, 'user_verification']
        );

        if (otpResult.rows.length === 0) {
          res.status(400).json({
            success: false,
            error: { message: 'Código OTP inválido o expirado' }
          } as ApiResponse<null>);
          return;
        }

        otpData = otpResult.rows[0];
      } finally {
        otpClient.release();
      }

      // Marcar usuario como verificado y OTP como usado (PostgreSQL)
      const updateClient = await postgresPool.connect();
      try {
        await updateClient.query('BEGIN');
        
        await updateClient.query(
          `UPDATE usuarios SET verificado = true, fecha_verificacion = NOW() WHERE id = $1`,
          [usuario.id]
        );

        await updateClient.query(
          'UPDATE otp_tokens SET usado = true WHERE id = $1',
          [otpData.id]
        );

        await updateClient.query('COMMIT');
      } catch (updateError) {
        await updateClient.query('ROLLBACK');
        console.error('Error updating user verification:', updateError);
        res.status(500).json({
          success: false,
          error: { message: 'Error verificando usuario' }
        } as ApiResponse<null>);
        return;
      } finally {
        updateClient.release();
      }

      res.json({
        success: true,
        data: { message: 'Usuario verificado exitosamente' }
      } as ApiResponse<{ message: string }>);

    } catch (error) {
      console.error('Error in verifyUserOTP:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Resetear contraseña con OTP
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔐 Backend - resetPassword llamado con datos:', req.body);
      const { email, otp, newPassword } = req.body;

      if (!email || !otp || !newPassword) {
        res.status(400).json({
          success: false,
          error: { message: 'Email, OTP y nueva contraseña son requeridos' }
        } as ApiResponse<null>);
        return;
      }

      // Buscar usuario (PostgreSQL)
      const client = await postgresPool.connect();
      let usuario: any;
      try {
        const result = await client.query(
          'SELECT id, email FROM usuarios WHERE email = $1 LIMIT 1',
          [email]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Usuario no encontrado' }
          } as ApiResponse<null>);
          return;
        }

        usuario = result.rows[0];
      } finally {
        client.release();
      }

      // Verificar OTP (PostgreSQL)
      console.log('🔐 Backend - Verificando OTP:', { 
        userId: usuario.id, 
        otp: otp, 
        currentTime: new Date().toISOString() 
      });

      const otpClient = await postgresPool.connect();
      let otpData: any;
      try {
        const otpResult = await otpClient.query(
          `SELECT * FROM otp_tokens
           WHERE usuario_id = $1
             AND token = $2
             AND tipo = $3
             AND usado = false
             AND expires_at > NOW()
           LIMIT 1`,
          [usuario.id, otp, 'password_recovery']
        );

        console.log('🔐 Backend - Resultado de verificación OTP:', { 
          found: otpResult.rows.length > 0
        });

        if (otpResult.rows.length === 0) {
          console.log('🔐 Backend - OTP inválido o expirado');
          res.status(400).json({
            success: false,
            error: { message: 'Código OTP inválido o expirado' }
          } as ApiResponse<null>);
          return;
        }

        otpData = otpResult.rows[0];
      } finally {
        otpClient.release();
      }

      // Validar nueva contraseña
      if (newPassword.length < 6) {
        res.status(400).json({
          success: false,
          error: { message: 'La nueva contraseña debe tener al menos 6 caracteres' }
        } as ApiResponse<null>);
        return;
      }

      // Hash de la nueva contraseña
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Actualizar contraseña y marcar OTP como usado (PostgreSQL)
      const updateClient = await postgresPool.connect();
      try {
        await updateClient.query('BEGIN');
        
        await updateClient.query(
          `UPDATE usuarios SET password_hash = $1, password_changed_at = NOW() WHERE id = $2`,
          [newPasswordHash, usuario.id]
        );

        await updateClient.query(
          'UPDATE otp_tokens SET usado = true, fecha_uso = NOW() WHERE id = $1',
          [otpData.id]
        );

        await updateClient.query('COMMIT');
      } catch (updateError) {
        await updateClient.query('ROLLBACK');
        throw new Error(`Error actualizando contraseña: ${(updateError as Error).message}`);
      } finally {
        updateClient.release();
      }

      res.json({
        success: true,
        data: { message: 'Contraseña restablecida exitosamente' }
      } as ApiResponse<{ message: string }>);

    } catch (error) {
      console.error('Error in resetPassword:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }
}
