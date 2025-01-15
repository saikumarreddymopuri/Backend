import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"


const generateaccessTokenAndRefreshTokens = async(userId) => {
   try {
      const user = await User.findById(userId)
      const accessToken = user.generateaccessToken()
      // console.log("access",accessToken)
      const refreshToken = user.generateRefreshToken()

      user.refreshToken = refreshToken
      await user.save({ validateBeforeSave: false })

      return {accessToken, refreshToken}
      
   } catch (error) {
      throw new ApiError(500, "something went wrong while generating refresh and access token")
      
   }
}

const registerUser = asyncHandler( async ( req, res ) => {
     // get user details from frontend
     // validation - not empty
     // check if user alredy exists; username,email
     // check for images,check for avatar
     // upload them to cloudinary,avatar
     // create user object - create entry in db
     // remove password and refresh token field from response
     // check for user creation 
     // return response
      

     const {fullName, email, username, password} = req.body
    //  console.log("email: ",email);
    //  console.log("password: ",password);

     if (
      [fullName, email, username, password].some((field) => field?.trim() === "")
   ) {
      throw new ApiError(400,"All fields are required")
     }

     const existedUser = await User.findOne({
      $or: [{ username }, { email }]
     })

     if (existedUser) {
         throw new ApiError(409,"User with email or username already exists ")
     }

     const avatarLocalPath = req.files?.avatar[0]?.path;
     //const coverImageLocalPath = req.files?.coverImage[0]?.path;

     let coverImageLocalPath;
     if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0]?.path
     }

     if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is required")
     }

     const avatar = await uploadOnCloudinary(avatarLocalPath)
     const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    //  console.log(coverImage)
    //  console.log(avatarLocalPath)

     if (!avatar) {
      throw new ApiError(400,"Avatar file is required")
     }

     const user = await User.create({
      fullName,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      password,
      email,
      username: username.toLowerCase()
     })

     const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
     ) 

     if (!createdUser) {
         throw new ApiError(500, "Something went wrong while registring the user")
     }

     return res.status(201).json(
      new ApiResponse(200, createdUser, "User registered sucessfully")
     )

} )

const loginUser = asyncHandler(async (req, res) => {
   // req body -> data
   // user or email
   // find the user
   // aceess and refresh token
   // send cookies

   const {email, username, password} = req.body

   if (!username || !email) {
      throw new ApiError(400, "username or email is required")
   }

   const user = await User.findOne({
      $or: [{username},{email}]
   })
   if (!user) {
      throw new ApiError(404,"user doesnot exist")
   }

   const isPasswordValid = await user.isPasswordCorrect(password)

   if (!isPasswordValid) {
      throw new ApiError(401, "Invalid user credentials")
   }
   
   const {accessToken,refreshToken} = await generateaccessTokenAndRefreshTokens(user._id)
   
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

   const options = {
      httpOnly: true,
      secure: true
   }
   
   return res
   .status(200)
   
   .cookie("accessToken",accessToken, options)
   
   .cookie("refreshToken",refreshToken, options)
   .json(
      new ApiResponse(
         200,
         {
            user: loggedInUser, accessToken,refreshToken
         },
         "User loggedin successfully"
      )
   )
   
})

const logoutUser = asyncHandler(async(req, res) => {
   await User.findByIdAndUpdate(
      req.user._id,
      {
         $set:{
            refreshToken: undefined
         }
      },
      {
         new: true
      } 

   )

   const options = {
      httpOnly: true,
      secure: true
   }

   return res
   .status(200)
   .clearCookie("accessToken", options)
   .clearCookie("refreshToken", options)
   .json(new ApiResponse(200, {}, "User logged Out"))


})

const refreshAccessToken = asyncHandler(async(req, res) => {
      const incomingRefreshToken = req.cookies.
      refreshToken || req.body.refreshToken
   
      if (!incomingRefreshToken) {
         throw new ApiError(401,"unauthorized request")
      }
   
      try {
          const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
         )
      
         const user = await User.findById(decodedToken?._id)
      
         if (!user) {
            throw new ApiError(401,"invalid refresh token")
         }
      
         if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401,"refresh token is expired or used")
      
         }
      
      
         const options = {
            httpOnly: true,
            secure: true
         }
      
         const {accessToken, refreshToken} = await generateaccessTokenAndRefreshTokens(user._id)
      
         return res
         .status(200)
         .cookie("accessToken", accessToken, options)
         .cookie("refreshToken", newrefreshToken, options)
         .json(
            new ApiResponse(
               200,
               {accessToken, refreshToken : newrefreshToken},
               "Access Token refreshed"
            )
         )
      } catch (error) {
         throw new ApiError(401, error?.message ||"invalid refresh token")
         
      }
   
})

const changeCurrentPassword = asyncHandler(async(req, res) => {
   const {oldPassword, newPassword} = req.body


   const user = await User.findById(req.user?._id)
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

   if (!isPasswordCorrect) {
      throw new ApiError(400, "Invalid old password")
   }

   user.password = newPassword
   await user.save({validateBeforeSave: false})

   return res
   .status(200)
   .json(new ApiResponse(200, {}, "password change successfully"))
})



const getCurrentUser = asyncHandler(async(res, req) =>{
   return res
   .status(200)
   .json(200, req.user, "current user fetched successfully")
})

const updateAccountDetails = asyncHandler(async(req, res) => {
   const {fullName, email} = req.body

   if(!fullName || !email) {
      throw new ApiError(400, "All the feilds are required")
   }

   const user = User.findByIdAndUpdate(
      req.user?._id,
      {
         $set: {
            fullName: fullName,
            email: email
         }
      },
      {new: true}
   ).select("-password")

   return res
   .status(200)
   .json(new ApiResponse(200, user, "Account Details Updated successfully"))
})

const upadteUserAvatar = asyncHandler(async(req, res) => {
   const avatarLocalPath = req.file?.path

   if (!avatarLocalPath) {
      throw new ApiError(400,"Avatar file is missing")
   }

   const avatar = await uploadOnCloudinary
   {avatarLocalPath}

   if (!avatar.url) {
      throw new ApiError(400," Error while uploading on avatar")
   }

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            avatar: avatar.url
         }
      },
      {new: true}
   ).select("-password")

   return res
   .status(200)
   .json(new ApiResponse (200, user, " Avatar is updated successfully")
   )
})

const updateUserCoverimage = asyncHandler(async(req, res) => {
   const coverImageLocalPath = req.file?.path

   if (!coverImageLocalPath) {
      throw new ApiError(400,"cover image file is missing")
   }

   const coverImage  = await uploadOnCloudinary
   {coverImageLocalPath}

   if (!coverImage.url) {
      throw new ApiError(400," Error while uploading on coverImage")
   }

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            coverImage: coverImage.url
         }
      },
      {new: true}
   ).select("-password")

   return res
   .status(200)
   .json(new ApiResponse (200, user, "CoverImage is updated successfully")
   )
})




export { 
   registerUser,
   loginUser,
   logoutUser,
   refreshAccessToken,
   changeCurrentPassword,
   getCurrentUser,
   updateAccountDetails,
   upadteUserAvatar,
   updateUserCoverimage
   
   
   
   
 }